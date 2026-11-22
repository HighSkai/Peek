//! System output level (for the audio-reactive visualizer) and master volume.

use std::{
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const LEVEL_EVENT: &str = "audio://level";

#[derive(Debug, Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeState {
    pub level: f32,
    pub muted: bool,
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelEvent {
    pub peak: f32,
    pub left: f32,
    pub right: f32,
    pub volume: f32,
    pub muted: bool,
}

#[derive(Default)]
pub struct AudioState {
    metering: AtomicBool,
}

pub fn start(app: &AppHandle) {
    let handle = app.clone();
    thread::Builder::new()
        .name("peek-audio".into())
        .spawn(move || meter_loop(handle))
        .ok();
}

fn meter_loop(app: AppHandle) {
    #[cfg(windows)]
    platform::init_thread();
    let mut endpoint: Option<platform::Endpoint> = None;
    let mut ticks: u32 = 0;
    loop {
        let state = app.state::<AudioState>();
        if !state.metering.load(Ordering::SeqCst) {
            endpoint = None;
            thread::sleep(Duration::from_millis(200));
            continue;
        }
        // Re-open the default device periodically so switching outputs is picked up.
        if endpoint.is_none() || ticks % 120 == 0 {
            endpoint = platform::Endpoint::default_output();
        }
        ticks = ticks.wrapping_add(1);
        if let Some(ep) = &endpoint {
            match ep.levels() {
                Some(ev) => {
                    if let Some(win) = crate::island::window(&app) {
                        let _ = win.emit(LEVEL_EVENT, ev);
                    }
                }
                None => endpoint = None,
            }
        }
        thread::sleep(Duration::from_millis(40));
    }
}

/// Turn the level meter on while a visualizer is on screen.
#[tauri::command]
pub fn audio_set_metering(state: tauri::State<'_, AudioState>, active: bool) {
    state.metering.store(active, Ordering::SeqCst);
}

#[tauri::command]
pub async fn audio_get_volume() -> Result<VolumeState, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(windows)]
        platform::init_thread();
        platform::Endpoint::default_output()
            .and_then(|e| e.volume())
            .ok_or_else(|| "no audio output device".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn audio_set_volume(
    level: Option<f32>,
    muted: Option<bool>,
) -> Result<VolumeState, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        platform::init_thread();
        let ep = platform::Endpoint::default_output().ok_or("no audio output device")?;
        ep.set(level, muted);
        ep.volume()
            .ok_or_else(|| "no audio output device".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(windows)]
mod platform {
    use windows::Win32::{
        Media::Audio::{
            eConsole, eRender,
            Endpoints::{IAudioEndpointVolume, IAudioMeterInformation},
            IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator,
        },
        System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED},
    };

    use super::{LevelEvent, VolumeState};

    pub fn init_thread() {
        // S_FALSE / RPC_E_CHANGED_MODE are fine: COM is usable either way.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    pub struct Endpoint {
        meter: IAudioMeterInformation,
        volume: IAudioEndpointVolume,
    }

    impl Endpoint {
        pub fn default_output() -> Option<Self> {
            unsafe {
                let enumerator: IMMDeviceEnumerator =
                    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
                let device: IMMDevice =
                    enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
                let meter: IAudioMeterInformation = device.Activate(CLSCTX_ALL, None).ok()?;
                let volume: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None).ok()?;
                Some(Self { meter, volume })
            }
        }

        pub fn levels(&self) -> Option<LevelEvent> {
            unsafe {
                let peak = self.meter.GetPeakValue().ok()?;
                let channels = self.meter.GetMeteringChannelCount().unwrap_or(0);
                let (mut left, mut right) = (peak, peak);
                if channels >= 2 {
                    let mut buf = vec![0f32; channels as usize];
                    if self.meter.GetChannelsPeakValues(&mut buf).is_ok() {
                        left = buf[0];
                        right = buf[1];
                    }
                }
                let vol = self.volume().unwrap_or_default();
                Some(LevelEvent {
                    peak,
                    left,
                    right,
                    volume: vol.level,
                    muted: vol.muted,
                })
            }
        }

        pub fn volume(&self) -> Option<VolumeState> {
            unsafe {
                Some(VolumeState {
                    level: self.volume.GetMasterVolumeLevelScalar().ok()?,
                    muted: self.volume.GetMute().ok()?.as_bool(),
                })
            }
        }

        pub fn set(&self, level: Option<f32>, muted: Option<bool>) {
            unsafe {
                if let Some(l) = level {
                    let _ = self
                        .volume
                        .SetMasterVolumeLevelScalar(l.clamp(0.0, 1.0), std::ptr::null());
                }
                if let Some(m) = muted {
                    let _ = self.volume.SetMute(m, std::ptr::null());
                }
            }
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::{LevelEvent, VolumeState};
    pub struct Endpoint;
    impl Endpoint {
        pub fn default_output() -> Option<Self> {
            None
        }
        pub fn levels(&self) -> Option<LevelEvent> {
            None
        }
        pub fn volume(&self) -> Option<VolumeState> {
            None
        }
        pub fn set(&self, _level: Option<f32>, _muted: Option<bool>) {}
    }
}
