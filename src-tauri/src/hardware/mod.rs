//! Hardware monitoring.
//!
//! CPU, memory, disks and network come from `sysinfo`. On Windows we add GPU usage and
//! VRAM for every vendor (Performance Counters + DXGI), NVIDIA details through NVML, and
//! temperatures / fan speeds from LibreHardwareMonitor or OpenHardwareMonitor when one of
//! them is running (they publish sensors over WMI). The sampler only runs while the
//! dashboard is open or the compact island shows live stats.

#[cfg(windows)]
mod win;

use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Condvar, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, Networks, RefreshKind, System};
use tauri::{AppHandle, Emitter, Manager};

use crate::settings::SettingsStore;

pub const SNAPSHOT_EVENT: &str = "hardware://snapshot";

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub name: String,
    pub usage: f32,
    pub per_core: Vec<f32>,
    pub frequency_mhz: u64,
    pub physical_cores: usize,
    pub logical_cores: usize,
    pub temperature: Option<f32>,
    pub power_watts: Option<f32>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub used: u64,
    pub total: u64,
    pub swap_used: u64,
    pub swap_total: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    pub usage: Option<f32>,
    pub memory_used: Option<u64>,
    pub memory_total: Option<u64>,
    pub temperature: Option<f32>,
    pub hotspot_temperature: Option<f32>,
    pub fan_percent: Option<f32>,
    pub fan_rpm: Option<f32>,
    pub power_watts: Option<f32>,
    pub clock_mhz: Option<f32>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub mount: String,
    pub used: u64,
    pub total: u64,
    pub read_bps: f64,
    pub write_bps: f64,
    pub removable: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    pub rx_bps: f64,
    pub tx_bps: f64,
    pub rx_total: u64,
    pub tx_total: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorReading {
    pub hardware: String,
    pub name: String,
    pub value: f32,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryInfo {
    pub percent: f32,
    pub charging: bool,
    pub plugged_in: bool,
    pub seconds_left: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub timestamp: u64,
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub gpus: Vec<GpuInfo>,
    pub disks: Vec<DiskInfo>,
    pub network: NetworkInfo,
    pub temperatures: Vec<SensorReading>,
    pub fans: Vec<SensorReading>,
    pub battery: Option<BatteryInfo>,
    pub uptime_secs: u64,
    /// "LibreHardwareMonitor" / "OpenHardwareMonitor" when a sensor provider is connected.
    pub sensor_source: Option<String>,
}

/// Extra data that only some platforms can provide.
#[derive(Default)]
pub struct Extras {
    pub gpus: Vec<GpuInfo>,
    pub cpu_temperature: Option<f32>,
    pub cpu_power: Option<f32>,
    pub temperatures: Vec<SensorReading>,
    pub fans: Vec<SensorReading>,
    pub battery: Option<BatteryInfo>,
    pub sensor_source: Option<String>,
}

pub struct HardwareState {
    dashboard_open: AtomicBool,
    compact_stats: AtomicBool,
    wake: (Mutex<bool>, Condvar),
    latest: Mutex<Option<Snapshot>>,
}

impl Default for HardwareState {
    fn default() -> Self {
        Self {
            dashboard_open: AtomicBool::new(false),
            compact_stats: AtomicBool::new(false),
            wake: (Mutex::new(false), Condvar::new()),
            latest: Mutex::new(None),
        }
    }
}

impl HardwareState {
    fn active(&self) -> bool {
        self.dashboard_open.load(Ordering::SeqCst) || self.compact_stats.load(Ordering::SeqCst)
    }

    fn notify(&self) {
        let (lock, cvar) = &self.wake;
        *lock.lock().unwrap() = true;
        cvar.notify_all();
    }

    /// Sleep until woken or the timeout elapses.
    fn wait(&self, timeout: Duration) {
        let (lock, cvar) = &self.wake;
        let mut woke = lock.lock().unwrap();
        if !*woke {
            woke = cvar.wait_timeout(woke, timeout).unwrap().0;
        }
        *woke = false;
    }
}

pub fn set_dashboard_open(app: &AppHandle, open: bool) {
    let state = app.state::<HardwareState>();
    if state.dashboard_open.swap(open, Ordering::SeqCst) != open && open {
        state.notify();
    }
}

pub fn start(app: &AppHandle) {
    let handle = app.clone();
    thread::Builder::new()
        .name("peek-hardware".into())
        .spawn(move || sampler_loop(handle))
        .ok();
}

fn sampler_loop(app: AppHandle) {
    let mut sys = match System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::nothing().with_usage().with_frequency())
            .with_memory(MemoryRefreshKind::everything()),
    ) {
        Ok(sys) => sys,
        Err(e) => {
            log::error!("hardware monitoring unavailable: {e}");
            return;
        }
    };
    let mut networks = Networks::new_with_refreshed_list().ok();
    let mut disks = Disks::new_with_refreshed_list().ok();
    let cpu_name = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_default();
    let physical_cores = System::physical_core_count().unwrap_or(0);

    #[cfg(windows)]
    let mut platform = win::Platform::new();

    let mut last = Instant::now();
    let mut disk_list_refresh = Instant::now();

    loop {
        let state = app.state::<HardwareState>();
        let settings = app.state::<SettingsStore>().get();
        if !settings.feature_hardware || !state.active() {
            state.wait(Duration::from_secs(5));
            // Reset counters so the first sample after waking is not averaged over the idle period.
            sys.refresh_cpu_usage();
            if let Some(n) = networks.as_mut() {
                n.refresh(true);
            }
            if let Some(d) = disks.as_mut() {
                d.refresh(true);
            }
            last = Instant::now();
            thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL.max(Duration::from_millis(250)));
            continue;
        }

        sys.refresh_cpu_specifics(CpuRefreshKind::nothing().with_usage().with_frequency());
        sys.refresh_memory();
        if let Some(n) = networks.as_mut() {
            n.refresh(true);
        }
        if let Some(d) = disks.as_mut() {
            let full = disk_list_refresh.elapsed() > Duration::from_secs(30);
            d.refresh(full);
            if full {
                disk_list_refresh = Instant::now();
            }
        }
        let elapsed = last.elapsed().as_secs_f64().max(0.001);
        last = Instant::now();

        let cpus = sys.cpus();
        let cpu = CpuInfo {
            name: cpu_name.clone(),
            usage: sys.global_cpu_usage(),
            per_core: cpus.iter().map(|c| c.usage()).collect(),
            frequency_mhz: cpus.iter().map(|c| c.frequency()).max().unwrap_or(0),
            physical_cores,
            logical_cores: cpus.len(),
            temperature: None,
            power_watts: None,
        };

        let memory = MemoryInfo {
            used: sys.used_memory(),
            total: sys.total_memory(),
            swap_used: sys.used_swap(),
            swap_total: sys.total_swap(),
        };

        let mut network = NetworkInfo::default();
        for (name, data) in networks.iter().flat_map(|n| n.iter()) {
            let lname = name.to_string_lossy().to_lowercase();
            if lname.contains("loopback") || lname.starts_with("lo") && lname.len() <= 3 {
                continue;
            }
            network.rx_bps += data.received() as f64 / elapsed;
            network.tx_bps += data.transmitted() as f64 / elapsed;
            network.rx_total += data.total_received();
            network.tx_total += data.total_transmitted();
        }

        let mut disk_list: Vec<DiskInfo> = disks
            .iter()
            .flat_map(|d| d.iter())
            .filter(|d| d.total_space() > 0)
            .map(|d| {
                let usage = d.usage();
                DiskInfo {
                    name: d.name().to_string_lossy().to_string(),
                    mount: d.mount_point().to_string_lossy().to_string(),
                    used: d.total_space().saturating_sub(d.available_space()),
                    total: d.total_space(),
                    read_bps: usage.read_bytes as f64 / elapsed,
                    write_bps: usage.written_bytes as f64 / elapsed,
                    removable: d.is_removable(),
                }
            })
            .collect();
        disk_list.sort_by(|a, b| a.mount.cmp(&b.mount));
        disk_list.dedup_by(|a, b| a.mount == b.mount);

        #[cfg(windows)]
        let extras = platform.sample();
        #[cfg(not(windows))]
        let extras = Extras::default();

        let mut snapshot = Snapshot {
            timestamp: now_ms(),
            cpu,
            memory,
            gpus: extras.gpus,
            disks: disk_list,
            network,
            temperatures: extras.temperatures,
            fans: extras.fans,
            battery: extras.battery,
            uptime_secs: System::uptime().unwrap_or(0),
            sensor_source: extras.sensor_source,
        };
        snapshot.cpu.temperature = extras.cpu_temperature;
        snapshot.cpu.power_watts = extras.cpu_power;

        if let Some(win) = crate::island::window(&app) {
            let _ = win.emit(SNAPSHOT_EVENT, &snapshot);
        }
        *state.latest.lock().unwrap() = Some(snapshot);

        let interval = Duration::from_millis(settings.hardware_interval_ms as u64);
        state.wait(interval);
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn hardware_snapshot(state: tauri::State<'_, HardwareState>) -> Option<Snapshot> {
    state.latest.lock().unwrap().clone()
}

/// The compact island asks for samples when it is configured to show live stats.
#[tauri::command]
pub fn hardware_set_compact(state: tauri::State<'_, HardwareState>, active: bool) {
    if state.compact_stats.swap(active, Ordering::SeqCst) != active && active {
        state.notify();
    }
}
