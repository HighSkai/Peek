//! The island window: placement at the top of the screen, click-through outside of the
//! visible island, fullscreen auto-hide and focus handling.
//!
//! The window is a fixed-size transparent overlay that is large enough to hold the
//! expanded dashboard. The webview reports the rectangle of the island as it animates and
//! a lightweight thread toggles click-through so that only the island itself captures
//! the mouse. This keeps the animations entirely in CSS, with no window resizing.

use std::{
    sync::{
        atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

use crate::settings::{Density, IslandMode, Settings, SettingsStore, SizePreset};

pub const LABEL: &str = "island";
pub const HOVER_EVENT: &str = "island://hover";
pub const COMMAND_EVENT: &str = "island://command";

/// Logical size of the open island at its tallest (the settings section). Each section
/// only takes the height it needs; see `dashboardSize` in `src/lib/layout.ts`.
pub fn dashboard_size(preset: SizePreset, density: Density) -> (f64, f64) {
    let (w, h) = match preset {
        SizePreset::Small => (540.0, 372.0),
        SizePreset::Medium => (600.0, 404.0),
        SizePreset::Large => (680.0, 452.0),
    };
    let scale = match density {
        Density::Regular => 1.0,
        Density::Compact => 0.86,
    };
    (w * scale, h * scale)
}

/// Extra transparent room around the dashboard for shadows, overshoot of the spring and
/// stretching the open dashboard down (up to 34 px, see IslandApp.tsx).
const SIDE_MARGIN: f64 = 48.0;
const BOTTOM_MARGIN: f64 = 64.0;

#[derive(Default, Clone, Copy, Debug)]
struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Default)]
pub struct IslandState {
    /// Interactive region of the island in logical (CSS) pixels, relative to the window.
    hit: Mutex<Option<Rect>>,
    /// Bumped whenever the hit rect changes so the hover thread re-evaluates.
    hit_version: AtomicU64,
    /// Physical window position and scale, cached so the hover thread never has to
    /// round-trip through the event loop.
    geometry: Mutex<(i32, i32, f64)>,
    hovered: AtomicBool,
    ignoring: AtomicBool,
    expanded: AtomicBool,
    user_hidden: AtomicBool,
    fullscreen_hidden: AtomicBool,
    ready: AtomicBool,
    /// HWND that had focus before Peek took it, restored when the dashboard collapses.
    previous_foreground: AtomicIsize,
    pub quitting: AtomicBool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IslandCommand {
    /// "toggle" | "expand" | "collapse"
    pub action: String,
    pub tab: Option<String>,
    pub focus_search: bool,
}

pub fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

pub fn send_command(app: &AppHandle, action: &str, tab: Option<&str>, focus_search: bool) {
    if let Some(win) = window(app) {
        let state = app.state::<IslandState>();
        // Opening the dashboard always brings a hidden island back.
        if action != "collapse" && state.user_hidden.swap(false, Ordering::SeqCst) {
            update_visibility(app);
            crate::tray::refresh_menu(app);
        }
        let _ = win.emit(
            COMMAND_EVENT,
            IslandCommand {
                action: action.into(),
                tab: tab.map(Into::into),
                focus_search,
            },
        );
    }
}

/// Position and size the overlay window on the configured monitor.
pub fn layout(app: &AppHandle) {
    let Some(win) = window(app) else { return };
    let settings = app.state::<SettingsStore>().get();

    let monitors = win.available_monitors().unwrap_or_default();
    let monitor = monitors
        .iter()
        .find(|m| {
            !settings.monitor.is_empty()
                && m.name().map(|n| n == &settings.monitor).unwrap_or(false)
        })
        .cloned()
        .or_else(|| win.primary_monitor().ok().flatten())
        .or_else(|| monitors.first().cloned());
    let Some(monitor) = monitor else { return };

    let scale = monitor.scale_factor();
    let (dw, dh) = dashboard_size(settings.dashboard_size, settings.density);
    let top = match settings.mode {
        IslandMode::Notch => 0.0,
        IslandMode::Island => settings.offset_y as f64,
    };
    let lw = dw + SIDE_MARGIN * 2.0;
    let lh = dh + top + BOTTOM_MARGIN;
    let pw = (lw * scale).round();
    let ph = (lh * scale).round();

    let mpos = monitor.position();
    let msize = monitor.size();
    let x = mpos.x as f64 + (msize.width as f64 - pw) / 2.0 + settings.offset_x as f64 * scale;
    let y = mpos.y as f64;
    let (x, y) = (x.round() as i32, y.round() as i32);

    // Position first so that a DPI change caused by moving between monitors is applied
    // before the final size is set.
    let _ = win.set_position(PhysicalPosition::new(x, y));
    let _ = win.set_size(PhysicalSize::new(pw as u32, ph as u32));
    let _ = win.set_position(PhysicalPosition::new(x, y));

    *app.state::<IslandState>().geometry.lock().unwrap() = (x, y, scale);
}

/// Refresh the cached position/scale after the OS moved or rescaled the window.
pub fn refresh_geometry(app: &AppHandle) {
    if let Some(win) = window(app) {
        if let (Ok(pos), Ok(scale)) = (win.outer_position(), win.scale_factor()) {
            *app.state::<IslandState>().geometry.lock().unwrap() = (pos.x, pos.y, scale);
        }
    }
}

pub fn is_visible(app: &AppHandle) -> bool {
    let s = app.state::<IslandState>();
    !s.user_hidden.load(Ordering::SeqCst) && !s.fullscreen_hidden.load(Ordering::SeqCst)
}

pub fn is_user_hidden(app: &AppHandle) -> bool {
    app.state::<IslandState>()
        .user_hidden
        .load(Ordering::SeqCst)
}

pub fn set_user_hidden(app: &AppHandle, hidden: bool) {
    app.state::<IslandState>()
        .user_hidden
        .store(hidden, Ordering::SeqCst);
    if hidden {
        send_command(app, "collapse", None, false);
    }
    update_visibility(app);
    crate::tray::refresh_menu(app);
}

fn update_visibility(app: &AppHandle) {
    let Some(win) = window(app) else { return };
    let state = app.state::<IslandState>();
    if !state.ready.load(Ordering::SeqCst) {
        return;
    }
    if is_visible(app) {
        if !win.is_visible().unwrap_or(false) {
            let _ = win.show();
            // Showing can reset the z-order; make sure we stay above normal windows.
            let _ = win.set_always_on_top(true);
        }
    } else if win.is_visible().unwrap_or(false) {
        let _ = win.hide();
    }
}

/// Spawn the background threads that keep the overlay behaving like part of the OS.
pub fn start(app: &AppHandle) {
    // Hover / click-through thread.
    let handle = app.clone();
    thread::Builder::new()
        .name("peek-hover".into())
        .spawn(move || hover_loop(handle))
        .ok();

    // Fullscreen watcher and monitor-change watcher.
    let handle = app.clone();
    thread::Builder::new()
        .name("peek-watch".into())
        .spawn(move || watch_loop(handle))
        .ok();
}

fn hover_loop(app: AppHandle) {
    let mut last_cursor = (i32::MIN, i32::MIN);
    let mut last_version = u64::MAX;
    loop {
        let state = app.state::<IslandState>();
        if state.quitting.load(Ordering::SeqCst) {
            return;
        }
        let visible = state.ready.load(Ordering::SeqCst) && is_visible(&app);
        if !visible {
            thread::sleep(Duration::from_millis(250));
            continue;
        }

        let cursor = platform::cursor_position().or_else(|| {
            window(&app)
                .and_then(|w| w.cursor_position().ok())
                .map(|p| (p.x.round() as i32, p.y.round() as i32))
        });

        if let Some(cursor) = cursor {
            let version = state.hit_version.load(Ordering::SeqCst);
            if cursor != last_cursor
                || version != last_version
                || state.hovered.load(Ordering::SeqCst)
            {
                last_cursor = cursor;
                last_version = version;
                let (wx, wy, scale) = *state.geometry.lock().unwrap();
                let lx = (cursor.0 - wx) as f64 / scale;
                let ly = (cursor.1 - wy) as f64 / scale;
                let inside = state
                    .hit
                    .lock()
                    .unwrap()
                    .map(|r| lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h)
                    .unwrap_or(false);

                if state.ignoring.load(Ordering::SeqCst) == inside {
                    if let Some(win) = window(&app) {
                        if win.set_ignore_cursor_events(!inside).is_ok() {
                            state.ignoring.store(!inside, Ordering::SeqCst);
                        }
                    }
                }
                if state.hovered.swap(inside, Ordering::SeqCst) != inside {
                    if let Some(win) = window(&app) {
                        let _ = win.emit(HOVER_EVENT, inside);
                    }
                }
            }
        }

        // Poll faster while the pointer is on or near the island.
        let fast = state.hovered.load(Ordering::SeqCst) || state.expanded.load(Ordering::SeqCst);
        thread::sleep(Duration::from_millis(if fast { 16 } else { 40 }));
    }
}

fn watch_loop(app: AppHandle) {
    let mut last_monitors = String::new();
    let mut tick: u32 = 0;
    loop {
        let state = app.state::<IslandState>();
        if state.quitting.load(Ordering::SeqCst) {
            return;
        }
        let settings: Settings = app.state::<SettingsStore>().get();

        // Fullscreen apps (games, videos, presentations) hide the island.
        let fullscreen = settings.hide_in_fullscreen
            && !state.expanded.load(Ordering::SeqCst)
            && window(&app)
                .map(|w| platform::fullscreen_app_active(&w))
                .unwrap_or(false);
        if state.fullscreen_hidden.swap(fullscreen, Ordering::SeqCst) != fullscreen {
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || update_visibility(&handle));
        }

        // Re-layout when displays are added, removed, moved or rescaled.
        if tick % 4 == 0 {
            if let Some(win) = window(&app) {
                let sig = win
                    .available_monitors()
                    .unwrap_or_default()
                    .iter()
                    .map(|m| {
                        format!(
                            "{:?}{:?}{:?}{}",
                            m.name(),
                            m.position(),
                            m.size(),
                            m.scale_factor()
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("|");
                if sig != last_monitors {
                    if !last_monitors.is_empty() {
                        let handle = app.clone();
                        let _ = app.run_on_main_thread(move || layout(&handle));
                    }
                    last_monitors = sig;
                }
            }
        }
        tick = tick.wrapping_add(1);
        thread::sleep(Duration::from_millis(750));
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn island_ready(app: AppHandle) {
    let state = app.state::<IslandState>();
    if state.ready.swap(true, Ordering::SeqCst) {
        return;
    }
    layout(&app);
    let show = app.state::<SettingsStore>().get().show_on_startup;
    state.user_hidden.store(!show, Ordering::SeqCst);
    if let Some(win) = window(&app) {
        let _ = win.set_ignore_cursor_events(true);
        state.ignoring.store(true, Ordering::SeqCst);
    }
    update_visibility(&app);
    crate::tray::refresh_menu(&app);
}

#[tauri::command]
pub fn island_set_hit_rect(state: tauri::State<'_, IslandState>, x: f64, y: f64, w: f64, h: f64) {
    *state.hit.lock().unwrap() = Some(Rect { x, y, w, h });
    state.hit_version.fetch_add(1, Ordering::SeqCst);
}

#[tauri::command]
pub fn island_set_expanded(app: AppHandle, expanded: bool, focus: bool) {
    let state = app.state::<IslandState>();
    let was = state.expanded.swap(expanded, Ordering::SeqCst);
    // Opening over a fullscreen app (e.g. with the shortcut) shows the island right
    // away instead of waiting for the watcher thread to notice.
    if expanded && state.fullscreen_hidden.swap(false, Ordering::SeqCst) {
        update_visibility(&app);
    }
    let Some(win) = window(&app) else { return };
    if expanded && focus {
        if !win.is_focused().unwrap_or(false) {
            state
                .previous_foreground
                .store(platform::foreground_window(), Ordering::SeqCst);
        }
        let _ = win.set_ignore_cursor_events(false);
        state.ignoring.store(false, Ordering::SeqCst);
        let _ = win.set_focus();
    } else if !expanded && was {
        // Hand focus back to whatever the user was doing, but only if we still own it
        // (if the user clicked another window, that window already has focus).
        if win.is_focused().unwrap_or(false) {
            let prev = state.previous_foreground.swap(0, Ordering::SeqCst);
            platform::restore_foreground(prev);
        } else {
            state.previous_foreground.store(0, Ordering::SeqCst);
        }
    }
    crate::hardware::set_dashboard_open(&app, expanded);
}

#[tauri::command]
pub fn island_hide(app: AppHandle) {
    set_user_hidden(&app, true);
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Vec<String> {
    window(&app)
        .and_then(|w| w.available_monitors().ok())
        .unwrap_or_default()
        .iter()
        .filter_map(|m| m.name().cloned())
        .collect()
}

// ---------------------------------------------------------------------------
// Platform helpers
// ---------------------------------------------------------------------------

#[cfg(windows)]
mod platform {
    use tauri::WebviewWindow;
    use windows::Win32::{
        Foundation::{HWND, POINT, RECT},
        Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        },
        UI::{
            Shell::{
                SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
            },
            WindowsAndMessaging::{
                GetClassNameW, GetCursorPos, GetForegroundWindow, GetWindowRect, IsWindow,
                SetForegroundWindow,
            },
        },
    };

    pub fn cursor_position() -> Option<(i32, i32)> {
        let mut p = POINT::default();
        unsafe { GetCursorPos(&mut p).ok()? };
        Some((p.x, p.y))
    }

    pub fn foreground_window() -> isize {
        unsafe { GetForegroundWindow().0 as isize }
    }

    pub fn restore_foreground(hwnd: isize) {
        if hwnd == 0 {
            return;
        }
        let hwnd = HWND(hwnd as *mut _);
        unsafe {
            if IsWindow(Some(hwnd)).as_bool() {
                let _ = SetForegroundWindow(hwnd);
            }
        }
    }

    fn class_name(hwnd: HWND) -> String {
        let mut buf = [0u16; 128];
        let len = unsafe { GetClassNameW(hwnd, &mut buf) };
        String::from_utf16_lossy(&buf[..len.max(0) as usize])
    }

    /// True when a fullscreen app is in the foreground on the island's monitor.
    pub fn fullscreen_app_active(island: &WebviewWindow) -> bool {
        unsafe {
            // Exclusive fullscreen (D3D) and presentation mode are reported directly.
            // Borderless fullscreen (QUNS_BUSY, or nothing at all for some games and
            // browser videos) is confirmed with the geometry check below.
            if let Ok(state) = SHQueryUserNotificationState() {
                if state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE {
                    return true;
                }
            }

            let fg = GetForegroundWindow();
            if fg.0.is_null() {
                return false;
            }
            if let Ok(own) = island.hwnd() {
                if own.0 == fg.0 {
                    return false;
                }
            }
            let class = class_name(fg);
            if matches!(
                class.as_str(),
                "Progman"
                    | "WorkerW"
                    | "Shell_TrayWnd"
                    | "Shell_SecondaryTrayWnd"
                    | "Windows.UI.Core.CoreWindow"
                    | "XamlExplorerHostIslandWindow"
                    | "TopLevelWindowForOverflowXamlIsland"
                    | "NotifyIconOverflowWindow"
            ) {
                return false;
            }

            let mut rect = RECT::default();
            if GetWindowRect(fg, &mut rect).is_err() {
                return false;
            }
            let monitor = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                return false;
            }
            let m = info.rcMonitor;
            let covers = rect.left <= m.left
                && rect.top <= m.top
                && rect.right >= m.right
                && rect.bottom >= m.bottom;
            if !covers {
                return false;
            }
            // Only hide when the fullscreen window is on the island's monitor.
            if let Ok(own) = island.hwnd() {
                let own_monitor = MonitorFromWindow(HWND(own.0), MONITOR_DEFAULTTONEAREST);
                return own_monitor == monitor;
            }
            true
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use tauri::WebviewWindow;
    pub fn cursor_position() -> Option<(i32, i32)> {
        None
    }
    pub fn foreground_window() -> isize {
        0
    }
    pub fn restore_foreground(_hwnd: isize) {}
    pub fn fullscreen_app_active(_island: &WebviewWindow) -> bool {
        false
    }
}
