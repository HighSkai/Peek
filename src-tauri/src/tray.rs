//! System tray icon and menu.

use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

use crate::{
    island,
    settings::{IslandMode, SettingsStore, SETTINGS_EVENT},
};

const TRAY_ID: &str = "peek-tray";
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray.png");

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(TRAY_ICON)?)
        .tooltip("Peek")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                island::send_command(tray.app_handle(), "toggle", None, false);
            }
        })
        .build(app)?;
    Ok(())
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let settings = app.state::<SettingsStore>().get();
    let visible = !island::is_user_hidden(app);
    let open = MenuItem::with_id(app, "open", "Open dashboard", true, None::<&str>)?;
    let ask = MenuItem::with_id(app, "ask", "Ask Peek…", settings.feature_ai, None::<&str>)?;
    let show = CheckMenuItem::with_id(app, "show", "Show island", true, visible, None::<&str>)?;
    let hotkey = CheckMenuItem::with_id(
        app,
        "reveal-hotkey",
        "Show only on shortcut",
        true,
        settings.reveal == "hotkey",
        None::<&str>,
    )?;
    let notch = CheckMenuItem::with_id(
        app,
        "mode-notch",
        "Notch mode",
        true,
        settings.mode == IslandMode::Notch,
        None::<&str>,
    )?;
    let isl = CheckMenuItem::with_id(
        app,
        "mode-island",
        "Dynamic Island mode",
        true,
        settings.mode == IslandMode::Island,
        None::<&str>,
    )?;
    let prefs = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Peek", true, None::<&str>)?;
    MenuBuilder::new(app)
        .items(&[&open, &ask])
        .item(&PredefinedMenuItem::separator(app)?)
        .items(&[&show, &hotkey, &notch, &isl])
        .item(&PredefinedMenuItem::separator(app)?)
        .items(&[&prefs, &quit])
        .build()
}

/// Rebuild the menu so check marks reflect the current state.
pub fn refresh_menu(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(menu) = build_menu(app) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

fn patch_settings(app: &AppHandle, patch: serde_json::Value) {
    let store = app.state::<SettingsStore>();
    if let Ok((old, new)) = store.patch(patch) {
        let _ = crate::apply_settings(app, &old, &new);
        let _ = app.emit(SETTINGS_EVENT, &new);
    }
}

fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "open" => island::send_command(app, "expand", None, false),
        "ask" => island::send_command(app, "expand", Some("ask"), true),
        "show" => {
            let hidden = island::is_user_hidden(app);
            island::set_user_hidden(app, !hidden);
        }
        "reveal-hotkey" => {
            let hotkey = app.state::<SettingsStore>().get().reveal == "hotkey";
            let next = if hotkey { "always" } else { "hotkey" };
            patch_settings(app, serde_json::json!({ "reveal": next }));
        }
        "mode-notch" => patch_settings(app, serde_json::json!({ "mode": IslandMode::Notch })),
        "mode-island" => patch_settings(app, serde_json::json!({ "mode": IslandMode::Island })),
        "settings" => crate::open_settings_panel(app),
        "quit" => crate::quit(app),
        _ => {}
    }
    refresh_menu(app);
}
