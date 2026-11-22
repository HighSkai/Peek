//! Windows-only hardware sources: GPU engines (PDH + DXGI), NVIDIA NVML,
//! LibreHardwareMonitor / OpenHardwareMonitor over WMI, and battery status.

use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use nvml_wrapper::{
    enum_wrappers::device::{Clock, TemperatureSensor},
    Nvml,
};
use serde::Deserialize;
use windows::{
    core::{Interface, PCWSTR},
    Win32::{
        Foundation::ERROR_SUCCESS,
        Graphics::Dxgi::{
            CreateDXGIFactory1, IDXGIAdapter3, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE,
            DXGI_MEMORY_SEGMENT_GROUP_LOCAL, DXGI_QUERY_VIDEO_MEMORY_INFO,
        },
        System::{
            Performance::{
                PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData,
                PdhGetFormattedCounterArrayW, PdhOpenQueryW, PDH_FMT_COUNTERVALUE_ITEM_W,
                PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY, PDH_MORE_DATA,
            },
            Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS},
        },
    },
};
use wmi::WMIConnection;

use super::{BatteryInfo, Extras, GpuInfo, SensorReading};

pub struct Platform {
    gpu: GpuCounters,
    nvml: Option<Nvml>,
    sensors: Sensors,
    adapters: Vec<Adapter>,
    adapters_at: Instant,
}

impl Platform {
    pub fn new() -> Self {
        let nvml = Nvml::init().ok();
        if nvml.is_some() {
            log::info!("NVML available: NVIDIA sensors enabled");
        }
        Self {
            gpu: GpuCounters::new(),
            nvml,
            sensors: Sensors::new(),
            adapters: enumerate_adapters(),
            adapters_at: Instant::now(),
        }
    }

    pub fn sample(&mut self) -> Extras {
        if self.adapters_at.elapsed() > Duration::from_secs(60) {
            self.adapters = enumerate_adapters();
            self.adapters_at = Instant::now();
        }
        let usage = self.gpu.utilization();
        let mut gpus: Vec<GpuInfo> = self
            .adapters
            .iter()
            .map(|a| GpuInfo {
                name: a.name.clone(),
                vendor: a.vendor.clone(),
                usage: usage.get(&a.luid).copied().map(|u| u.clamp(0.0, 100.0)),
                memory_used: a.memory_used(),
                memory_total: (a.dedicated > 0).then_some(a.dedicated),
                ..Default::default()
            })
            .collect();

        // NVIDIA: fill in temperature, fan, power and clocks from NVML.
        if let Some(nvml) = &self.nvml {
            let count = nvml.device_count().unwrap_or(0);
            let mut used = vec![false; gpus.len()];
            for i in 0..count {
                let Ok(dev) = nvml.device_by_index(i) else {
                    continue;
                };
                let name = dev.name().unwrap_or_default();
                let idx = gpus
                    .iter()
                    .enumerate()
                    .position(|(j, g)| !used[j] && g.name.eq_ignore_ascii_case(&name))
                    .or_else(|| {
                        gpus.iter()
                            .enumerate()
                            .position(|(j, g)| !used[j] && g.vendor == "NVIDIA")
                    });
                let gpu = match idx {
                    Some(j) => {
                        used[j] = true;
                        &mut gpus[j]
                    }
                    None => {
                        gpus.push(GpuInfo {
                            name: name.clone(),
                            vendor: "NVIDIA".into(),
                            ..Default::default()
                        });
                        used.push(true);
                        gpus.last_mut().unwrap()
                    }
                };
                gpu.temperature = dev
                    .temperature(TemperatureSensor::Gpu)
                    .ok()
                    .map(|t| t as f32);
                gpu.fan_percent = dev.fan_speed(0).ok().map(|f| f as f32);
                gpu.power_watts = dev.power_usage().ok().map(|mw| mw as f32 / 1000.0);
                gpu.clock_mhz = dev.clock_info(Clock::Graphics).ok().map(|c| c as f32);
                if gpu.usage.is_none() {
                    gpu.usage = dev.utilization_rates().ok().map(|u| u.gpu as f32);
                }
                if let Ok(mem) = dev.memory_info() {
                    gpu.memory_used = Some(mem.used);
                    gpu.memory_total = Some(mem.total);
                }
            }
        }

        let mut extras = Extras {
            battery: battery(),
            ..Default::default()
        };

        // LibreHardwareMonitor / OpenHardwareMonitor sensors.
        if let Some(reading) = self.sensors.read() {
            extras.sensor_source = Some(reading.source.clone());
            extras.cpu_temperature = reading.cpu_temperature;
            extras.cpu_power = reading.cpu_power;
            extras.temperatures = reading.temperatures;
            extras.fans = reading.fans;
            // Merge GPU sensors for GPUs NVML did not cover (AMD, Intel).
            for lg in reading.gpus {
                let target = gpus
                    .iter()
                    .position(|g| names_match(&g.name, &lg.name))
                    .or_else(|| {
                        gpus.iter()
                            .position(|g| g.temperature.is_none() && g.vendor == lg.vendor)
                    });
                if let Some(g) = target.map(|i| &mut gpus[i]) {
                    g.temperature = g.temperature.or(lg.temperature);
                    g.hotspot_temperature = g.hotspot_temperature.or(lg.hotspot_temperature);
                    g.fan_rpm = g.fan_rpm.or(lg.fan_rpm);
                    g.fan_percent = g.fan_percent.or(lg.fan_percent);
                    g.power_watts = g.power_watts.or(lg.power_watts);
                    g.clock_mhz = g.clock_mhz.or(lg.clock_mhz);
                }
            }
        }

        extras.gpus = gpus;
        extras
    }
}

fn names_match(a: &str, b: &str) -> bool {
    let norm = |s: &str| s.to_lowercase().replace(['(', ')', '®', '™'], "");
    let (a, b) = (norm(a), norm(b));
    !a.is_empty() && !b.is_empty() && (a.contains(&b) || b.contains(&a))
}

// ---------------------------------------------------------------------------
// DXGI adapters
// ---------------------------------------------------------------------------

struct Adapter {
    name: String,
    vendor: String,
    luid: (u32, i32),
    dedicated: u64,
    adapter: IDXGIAdapter3,
}

impl Adapter {
    fn memory_used(&self) -> Option<u64> {
        let mut info = DXGI_QUERY_VIDEO_MEMORY_INFO::default();
        unsafe {
            self.adapter
                .QueryVideoMemoryInfo(0, DXGI_MEMORY_SEGMENT_GROUP_LOCAL, &mut info)
                .ok()?;
        }
        Some(info.CurrentUsage)
    }
}

fn vendor_name(id: u32) -> &'static str {
    match id {
        0x10DE => "NVIDIA",
        0x1002 | 0x1022 => "AMD",
        0x8086 => "Intel",
        0x5143 => "Qualcomm",
        _ => "",
    }
}

fn enumerate_adapters() -> Vec<Adapter> {
    let mut out = Vec::new();
    unsafe {
        let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() else {
            return out;
        };
        let mut i = 0;
        while let Ok(adapter) = factory.EnumAdapters1(i) {
            i += 1;
            let Ok(desc) = adapter.GetDesc1() else {
                continue;
            };
            if desc.Flags & (DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32) != 0 {
                continue;
            }
            let len = desc
                .Description
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(desc.Description.len());
            let name = String::from_utf16_lossy(&desc.Description[..len])
                .trim()
                .to_string();
            if name.contains("Microsoft Basic Render") {
                continue;
            }
            let luid = (desc.AdapterLuid.LowPart, desc.AdapterLuid.HighPart);
            if out.iter().any(|a: &Adapter| a.luid == luid) {
                continue;
            }
            let Ok(adapter3) = adapter.cast::<IDXGIAdapter3>() else {
                continue;
            };
            out.push(Adapter {
                name,
                vendor: vendor_name(desc.VendorId).to_string(),
                luid,
                dedicated: desc.DedicatedVideoMemory as u64,
                adapter: adapter3,
            });
        }
    }
    out
}

// ---------------------------------------------------------------------------
// GPU engine utilization (same source as Task Manager)
// ---------------------------------------------------------------------------

struct GpuCounters {
    query: Option<PDH_HQUERY>,
    counter: Option<PDH_HCOUNTER>,
}

impl GpuCounters {
    fn new() -> Self {
        unsafe {
            let mut query = PDH_HQUERY::default();
            if PdhOpenQueryW(PCWSTR::null(), 0, &mut query) != ERROR_SUCCESS.0 {
                return Self {
                    query: None,
                    counter: None,
                };
            }
            let path: Vec<u16> = "\\GPU Engine(*)\\Utilization Percentage\0"
                .encode_utf16()
                .collect();
            let mut counter = PDH_HCOUNTER::default();
            if PdhAddEnglishCounterW(query, PCWSTR(path.as_ptr()), 0, &mut counter)
                != ERROR_SUCCESS.0
            {
                PdhCloseQuery(query);
                return Self {
                    query: None,
                    counter: None,
                };
            }
            PdhCollectQueryData(query);
            Self {
                query: Some(query),
                counter: Some(counter),
            }
        }
    }

    /// Utilization per adapter LUID: the busiest engine type, summed across processes.
    fn utilization(&mut self) -> HashMap<(u32, i32), f32> {
        let mut result = HashMap::new();
        let (Some(query), Some(counter)) = (self.query, self.counter) else {
            return result;
        };
        unsafe {
            if PdhCollectQueryData(query) != ERROR_SUCCESS.0 {
                return result;
            }
            let mut size = 0u32;
            let mut count = 0u32;
            let status =
                PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut size, &mut count, None);
            if status != PDH_MORE_DATA || size == 0 {
                return result;
            }
            // u64 storage keeps the buffer suitably aligned for the item structs.
            let mut buf = vec![0u64; (size as usize).div_ceil(8)];
            let items = buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
            if PdhGetFormattedCounterArrayW(
                counter,
                PDH_FMT_DOUBLE,
                &mut size,
                &mut count,
                Some(items),
            ) != ERROR_SUCCESS.0
            {
                return result;
            }
            let items = std::slice::from_raw_parts(items, count as usize);
            let mut per_engine: HashMap<((u32, i32), String), f64> = HashMap::new();
            for item in items {
                let name = item.szName.to_string().unwrap_or_default();
                let Some(luid) = parse_luid(&name) else {
                    continue;
                };
                let engine = name.split("engtype_").nth(1).unwrap_or("").to_string();
                let value = item.FmtValue.Anonymous.doubleValue;
                if value.is_finite() {
                    *per_engine.entry((luid, engine)).or_insert(0.0) += value;
                }
            }
            for ((luid, _), v) in per_engine {
                let e = result.entry(luid).or_insert(0.0f32);
                *e = e.max(v as f32);
            }
        }
        result
    }
}

impl Drop for GpuCounters {
    fn drop(&mut self) {
        if let Some(q) = self.query {
            unsafe {
                PdhCloseQuery(q);
            }
        }
    }
}

/// Parse `..._luid_0x00000000_0x0000D1A5_...` into (LowPart, HighPart).
fn parse_luid(name: &str) -> Option<(u32, i32)> {
    let rest = &name[name.find("luid_0x")? + 7..];
    let mut parts = rest.split('_');
    let high = u32::from_str_radix(parts.next()?, 16).ok()?;
    let low = u32::from_str_radix(parts.next()?.strip_prefix("0x")?, 16).ok()?;
    Some((low, high as i32))
}

// ---------------------------------------------------------------------------
// Battery
// ---------------------------------------------------------------------------

fn battery() -> Option<BatteryInfo> {
    let mut status = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut status).ok()? };
    // 128 = no system battery, 255 = unknown.
    if status.BatteryFlag & 128 != 0 || status.BatteryFlag == 255 || status.BatteryLifePercent > 100
    {
        return None;
    }
    Some(BatteryInfo {
        percent: status.BatteryLifePercent as f32,
        charging: status.BatteryFlag & 8 != 0,
        plugged_in: status.ACLineStatus == 1,
        seconds_left: (status.BatteryLifeTime != u32::MAX).then_some(status.BatteryLifeTime),
    })
}

// ---------------------------------------------------------------------------
// LibreHardwareMonitor / OpenHardwareMonitor (WMI)
// ---------------------------------------------------------------------------

#[derive(Deserialize, Debug)]
#[serde(rename = "Sensor")]
#[serde(rename_all = "PascalCase")]
struct WmiSensor {
    name: String,
    sensor_type: String,
    value: f32,
    parent: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename = "Hardware")]
#[serde(rename_all = "PascalCase")]
struct WmiHardware {
    name: String,
    identifier: String,
    hardware_type: String,
}

#[derive(Default)]
struct LhmGpu {
    name: String,
    vendor: String,
    temperature: Option<f32>,
    hotspot_temperature: Option<f32>,
    fan_rpm: Option<f32>,
    fan_percent: Option<f32>,
    power_watts: Option<f32>,
    clock_mhz: Option<f32>,
}

struct SensorReadout {
    source: String,
    cpu_temperature: Option<f32>,
    cpu_power: Option<f32>,
    temperatures: Vec<SensorReading>,
    fans: Vec<SensorReading>,
    gpus: Vec<LhmGpu>,
}

struct Sensors {
    conn: Option<(WMIConnection, String)>,
    hardware: Vec<WmiHardware>,
    hardware_at: Instant,
    retry_at: Instant,
}

impl Sensors {
    fn new() -> Self {
        Self {
            conn: None,
            hardware: Vec::new(),
            hardware_at: Instant::now(),
            retry_at: Instant::now(),
        }
    }

    fn connect(&mut self) {
        for (ns, source) in [
            ("root\\LibreHardwareMonitor", "LibreHardwareMonitor"),
            ("root\\OpenHardwareMonitor", "OpenHardwareMonitor"),
        ] {
            if let Ok(conn) = WMIConnection::with_namespace_path(ns) {
                // The namespace can exist while the app is closed; check it has data.
                if let Ok(hw) = conn.query::<WmiHardware>() {
                    if !hw.is_empty() {
                        log::info!("connected to {source} sensors");
                        self.hardware = hw;
                        self.hardware_at = Instant::now();
                        self.conn = Some((conn, source.to_string()));
                        return;
                    }
                }
            }
        }
    }

    fn read(&mut self) -> Option<SensorReadout> {
        if self.conn.is_none() {
            if Instant::now() < self.retry_at {
                return None;
            }
            self.retry_at = Instant::now() + Duration::from_secs(15);
            self.connect();
        }
        let (conn, source) = self.conn.as_ref()?;
        let sensors = match conn.query::<WmiSensor>() {
            Ok(s) if !s.is_empty() => s,
            _ => {
                self.conn = None;
                return None;
            }
        };
        let source = source.clone();
        if self.hardware_at.elapsed() > Duration::from_secs(30) {
            if let Ok(hw) = conn.query::<WmiHardware>() {
                self.hardware = hw;
            }
            self.hardware_at = Instant::now();
        }

        let hw_by_id: HashMap<&str, &WmiHardware> = self
            .hardware
            .iter()
            .map(|h| (h.identifier.as_str(), h))
            .collect();

        let mut out = SensorReadout {
            source,
            cpu_temperature: None,
            cpu_power: None,
            temperatures: Vec::new(),
            fans: Vec::new(),
            gpus: Vec::new(),
        };
        let mut gpus: HashMap<String, LhmGpu> = HashMap::new();
        let mut cpu_temps: Vec<(i32, f32)> = Vec::new();

        for s in &sensors {
            let hw = hw_by_id.get(s.parent.as_str());
            let hw_name = hw.map(|h| h.name.clone()).unwrap_or_default();
            let hw_type = hw.map(|h| h.hardware_type.as_str()).unwrap_or("");
            let is_cpu = hw_type.eq_ignore_ascii_case("cpu");
            let is_gpu = hw_type.to_lowercase().starts_with("gpu");
            let lname = s.name.to_lowercase();

            match s.sensor_type.as_str() {
                "Temperature" => {
                    if !(s.value > 0.0 && s.value < 150.0) {
                        continue;
                    }
                    if is_cpu {
                        // Prefer the package / Tctl reading for the headline CPU temperature.
                        let rank = if lname.contains("package") || lname.contains("tctl") {
                            0
                        } else if lname.contains("core average") || lname.contains("cpu cores") {
                            1
                        } else if lname.contains("ccd") || lname.contains("core max") {
                            2
                        } else {
                            3
                        };
                        cpu_temps.push((rank, s.value));
                    }
                    if is_gpu {
                        let g = gpu_entry(&mut gpus, &s.parent, &hw_name, hw_type);
                        if lname.contains("hot spot") || lname.contains("hotspot") {
                            g.hotspot_temperature = Some(s.value);
                        } else if lname.contains("core") || g.temperature.is_none() {
                            g.temperature = Some(s.value);
                        }
                    }
                    out.temperatures.push(SensorReading {
                        hardware: hw_name,
                        name: s.name.clone(),
                        value: s.value,
                    });
                }
                "Fan" => {
                    if s.value <= 0.0 && !is_gpu {
                        // Unpopulated fan headers report 0 RPM; keep the list short.
                        continue;
                    }
                    if is_gpu {
                        gpu_entry(&mut gpus, &s.parent, &hw_name, hw_type)
                            .fan_rpm
                            .get_or_insert(s.value);
                    }
                    out.fans.push(SensorReading {
                        hardware: hw_name,
                        name: s.name.clone(),
                        value: s.value,
                    });
                }
                "Control" if is_gpu => {
                    gpu_entry(&mut gpus, &s.parent, &hw_name, hw_type)
                        .fan_percent
                        .get_or_insert(s.value);
                }
                "Power" => {
                    if is_cpu && (lname.contains("package") || out.cpu_power.is_none()) {
                        out.cpu_power = Some(s.value);
                    }
                    if is_gpu
                        && (lname.contains("package")
                            || lname.contains("core")
                            || lname.contains("total"))
                    {
                        gpu_entry(&mut gpus, &s.parent, &hw_name, hw_type)
                            .power_watts
                            .get_or_insert(s.value);
                    }
                }
                "Clock" if is_gpu && lname.contains("core") => {
                    gpu_entry(&mut gpus, &s.parent, &hw_name, hw_type)
                        .clock_mhz
                        .get_or_insert(s.value);
                }
                _ => {}
            }
        }

        cpu_temps.sort_by_key(|(rank, _)| *rank);
        out.cpu_temperature = cpu_temps.first().map(|(_, v)| *v);
        out.temperatures
            .sort_by(|a, b| a.hardware.cmp(&b.hardware).then(a.name.cmp(&b.name)));
        out.fans
            .sort_by(|a, b| a.hardware.cmp(&b.hardware).then(a.name.cmp(&b.name)));
        out.gpus = gpus.into_values().collect();
        Some(out)
    }
}

fn gpu_entry<'a>(
    map: &'a mut HashMap<String, LhmGpu>,
    id: &str,
    name: &str,
    hw_type: &str,
) -> &'a mut LhmGpu {
    map.entry(id.to_string()).or_insert_with(|| LhmGpu {
        name: name.to_string(),
        vendor: match hw_type.to_lowercase().as_str() {
            "gpunvidia" => "NVIDIA",
            "gpuamd" | "gpuati" => "AMD",
            "gpuintel" => "Intel",
            _ => "",
        }
        .to_string(),
        ..Default::default()
    })
}
