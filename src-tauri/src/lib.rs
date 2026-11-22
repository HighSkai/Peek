//! Peek: a Dynamic Island for Windows 11.

mod ai;
mod audio;
mod hardware;
mod island;
mod media;
mod secrets;
mod settings;
mod tray;
mod updates;

use std::sync::atomic::Ordering;

use serde::Serialize;
use settings::{Settings, SettingsStore};
use tauri::{
    utils::config::WindowEffectsConfig, window::Effect, AppHandle, Manager, RunEvent, Theme,
    WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;

const SETTINGS_LABEL: &str = "settings";

pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch focuses the running instance.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if !args.iter().any(|a| a == "--autostart") {
                open_settings_window(app);
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(512 * 1024)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(island::IslandState::default())
        .manage(hardware::HardwareState::default())
        .manage(media::MediaControl::default())
        .manage(audio::AudioState::default())
        .manage(ai::AiState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(SettingsStore::load(&handle));
            let settings = handle.state::<SettingsStore>().get();

            if let Err(e) = register_shortcut(&handle, &settings.shortcut) {
                log::warn!("could not register shortcut {:?}: {e}", settings.shortcut);
            }
            sync_autostart(&handle, settings.launch_at_login);
            tray::create(&handle)?;

            island::layout(&handle);
            island::start(&handle);
            hardware::start(&handle);
            media::start(&handle);
            audio::start(&handle);

            // Safety net: show the island even if the web view never reports ready.
            let fallback = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(4));
                let h = fallback.clone();
                let _ = fallback.run_on_main_thread(move || island::island_ready(h));
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != island::LABEL {
                return;
            }
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    let state = window.app_handle().state::<island::IslandState>();
                    if !state.quitting.load(Ordering::SeqCst) {
                        api.prevent_close();
                    }
                }
                WindowEvent::Moved(_) => island::refresh_geometry(window.app_handle()),
                WindowEvent::ScaleFactorChanged { .. } => island::layout(window.app_handle()),
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::update_settings,
            settings::reset_settings,
            island::island_ready,
            island::island_set_hit_rect,
            island::island_set_expanded,
            island::island_hide,
            island::list_monitors,
            hardware::hardware_snapshot,
            hardware::hardware_set_compact,
            media::media_state,
            media::media_command,
            audio::audio_set_metering,
            audio::audio_get_volume,
            audio::audio_set_volume,
            ai::ai_chat,
            ai::ai_cancel,
            ai::ai_list_models,
            ai::open_web_search,
            secrets::secret_set,
            secrets::secret_exists,
            updates::check_for_updates,
            open_settings,
            open_url,
            quit_app,
            system_info,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Peek")
        .run(|app, event| {
            if let RunEvent::ExitRequested { api, code, .. } = event {
                // Closing the settings window must not quit the app; only "Quit" does.
                let quitting = app
                    .state::<island::IslandState>()
                    .quitting
                    .load(Ordering::SeqCst);
                if code.is_none() && !quitting {
                    api.prevent_exit();
                }
            }
        });
}

/// Apply side effects of a settings change. Only the shortcut can fail.
pub(crate) fn apply_settings(
    app: &AppHandle,
    old: &Settings,
    new: &Settings,
) -> Result<(), String> {
    if old.shortcut != new.shortcut {
        if let Err(e) = register_shortcut(app, &new.shortcut) {
            let _ = register_shortcut(app, &old.shortcut);
            return Err(format!("Couldn't use that shortcut: {e}"));
        }
    }
    if old.launch_at_login != new.launch_at_login {
        sync_autostart(app, new.launch_at_login);
    }
    if old.mode != new.mode
        || old.dashboard_size != new.dashboard_size
        || old.offset_x != new.offset_x
        || old.offset_y != new.offset_y
        || old.monitor != new.monitor
    {
        island::layout(app);
    }
    if old.theme != new.theme {
        if let Some(w) = app.get_webview_window(SETTINGS_LABEL) {
            let _ = w.set_theme(theme(&new.theme));
        }
    }
    if old.mode != new.mode || old.feature_ai != new.feature_ai {
        tray::refresh_menu(app);
    }
    Ok(())
}

fn register_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let shortcut = shortcut.trim();
    if shortcut.is_empty() {
        return Ok(());
    }
    gs.on_shortcut(shortcut, |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            island::send_command(app, "toggle", Some("home"), true);
        }
    })
    .map_err(|e| e.to_string())
}

fn sync_autostart(app: &AppHandle, enabled: bool) {
    let launcher = app.autolaunch();
    let current = launcher.is_enabled().unwrap_or(false);
    let result = match (enabled, current) {
        (true, false) => launcher.enable(),
        (false, true) => launcher.disable(),
        _ => Ok(()),
    };
    if let Err(e) = result {
        log::warn!("autostart update failed: {e}");
    }
}

fn theme(pref: &str) -> Option<Theme> {
    match pref {
        "dark" => Some(Theme::Dark),
        "light" => Some(Theme::Light),
        _ => None,
    }
}

pub(crate) fn open_settings_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let settings = app.state::<SettingsStore>().get();
    let mica = platform::is_windows_11();
    let mut builder =
        WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("index.html".into()))
            .title("Peek Settings")
            .inner_size(940.0, 660.0)
            .min_inner_size(760.0, 520.0)
            .center()
            .resizable(true)
            .theme(theme(&settings.theme));
    if mica {
        builder = builder.transparent(true).effects(WindowEffectsConfig {
            effects: vec![Effect::Mica],
            ..Default::default()
        });
    }
    match builder.build() {
        Ok(w) => {
            let _ = w.set_focus();
        }
        Err(e) => log::error!("failed to open settings: {e}"),
    }
}

pub(crate) fn quit(app: &AppHandle) {
    app.state::<island::IslandState>()
        .quitting
        .store(true, Ordering::SeqCst);
    app.exit(0);
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    open_settings_window(&app);
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only web links can be opened".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    quit(&app);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemInfo {
    version: String,
    mica: bool,
    os_build: u32,
}

#[tauri::command]
fn system_info(app: AppHandle) -> SystemInfo {
    SystemInfo {
        version: app.package_info().version.to_string(),
        mica: platform::is_windows_11(),
        os_build: platform::os_build(),
    }
}

#[cfg(windows)]
mod platform {
    use windows::{
        core::w,
        Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ},
    };

    pub fn os_build() -> u32 {
        let mut buf = [0u16; 32];
        let mut size = (buf.len() * 2) as u32;
        let status = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                w!("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"),
                w!("CurrentBuildNumber"),
                RRF_RT_REG_SZ,
                None,
                Some(buf.as_mut_ptr().cast()),
                Some(&mut size),
            )
        };
        if status.is_err() {
            return 0;
        }
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..len])
            .trim()
            .parse()
            .unwrap_or(0)
    }

    pub fn is_windows_11() -> bool {
        os_build() >= 22000
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn os_build() -> u32 {
        0
    }
    pub fn is_windows_11() -> bool {
        false
    }
}
