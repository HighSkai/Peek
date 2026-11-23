//! Persistent user settings. Stored as JSON in the app config directory.
//! API keys are never stored here: see `secrets.rs`.

use std::{fs, path::PathBuf, sync::RwLock};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

pub const SETTINGS_EVENT: &str = "settings://changed";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IslandMode {
    Notch,
    Island,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SizePreset {
    Small,
    Medium,
    Large,
}

/// How large everything is drawn. Compact is the same layout, about 14% smaller.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    Regular,
    Compact,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderKind {
    Ollama,
    Openai,
    Anthropic,
    Gemini,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProvider {
    pub id: String,
    pub name: String,
    pub kind: ProviderKind,
    pub base_url: String,
    pub model: String,
    /// Whether the provider expects an API key (stored in Windows Credential Manager).
    pub needs_key: bool,
    /// Local providers run on this machine; shown with a "Local" badge.
    pub local: bool,
}

impl AiProvider {
    fn new(
        id: &str,
        name: &str,
        kind: ProviderKind,
        base_url: &str,
        model: &str,
        needs_key: bool,
        local: bool,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            kind,
            base_url: base_url.into(),
            model: model.into(),
            needs_key,
            local,
        }
    }
}

pub fn default_providers() -> Vec<AiProvider> {
    use ProviderKind::*;
    vec![
        AiProvider::new(
            "ollama",
            "Ollama",
            Ollama,
            "http://127.0.0.1:11434",
            "llama3.2",
            false,
            true,
        ),
        AiProvider::new(
            "lmstudio",
            "LM Studio",
            Openai,
            "http://127.0.0.1:1234/v1",
            "",
            false,
            true,
        ),
        AiProvider::new(
            "openai",
            "OpenAI",
            Openai,
            "https://api.openai.com/v1",
            "gpt-5-mini",
            true,
            false,
        ),
        AiProvider::new(
            "anthropic",
            "Anthropic",
            Anthropic,
            "https://api.anthropic.com/v1",
            "claude-haiku-5-5",
            true,
            false,
        ),
        AiProvider::new(
            "gemini",
            "Google Gemini",
            Gemini,
            "https://generativelanguage.googleapis.com/v1beta",
            "gemini-2.5-flash",
            true,
            false,
        ),
        AiProvider::new(
            "openrouter",
            "OpenRouter",
            Openai,
            "https://openrouter.ai/api/v1",
            "openrouter/auto",
            true,
            false,
        ),
        AiProvider::new(
            "groq",
            "Groq",
            Openai,
            "https://api.groq.com/openai/v1",
            "llama-3.3-70b-versatile",
            true,
            false,
        ),
        AiProvider::new(
            "custom",
            "Custom (OpenAI-compatible)",
            Openai,
            "http://127.0.0.1:8080/v1",
            "",
            false,
            true,
        ),
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    // General / startup
    pub launch_at_login: bool,
    pub show_on_startup: bool,
    pub hide_in_fullscreen: bool,
    pub collapse_on_blur: bool,
    pub expand_on_hover: bool,
    pub hover_delay_ms: u32,
    pub shortcut: String,
    pub default_tab: String,
    /// "always": the island rests at the top of the screen.
    /// "hotkey": it stays out of sight until opened with the shortcut or the tray icon.
    pub reveal: String,

    // Appearance
    pub mode: IslandMode,
    /// "solid" (pure black, like the hardware) or "glass" (translucent).
    pub style: String,
    pub glass_opacity: f32,
    pub density: Density,
    pub island_size: SizePreset,
    pub dashboard_size: SizePreset,
    /// "eyes" | "clock" | "stats" | "none"
    pub idle_content: String,
    pub show_media_activity: bool,
    pub media_toast: bool,
    /// "audio" (reacts to system output) | "animated" | "off"
    pub visualizer: String,
    pub clock_24h: bool,

    // Position
    /// Monitor name, or empty for the primary monitor.
    pub monitor: String,
    pub offset_x: i32,
    pub offset_y: i32,

    // Animations
    /// "system" (follow Windows' animation effects setting) | "full" | "reduced" | "off"
    pub motion: String,
    pub animation_speed: f32,
    /// Spring bounce when the island opens (0 = no overshoot). Renamed from `bounce`
    /// in 0.3.0 so the old, bouncier default resets.
    pub spring_bounce: f32,
    pub hover_effect: bool,

    // Features
    pub feature_media: bool,
    pub feature_hardware: bool,
    pub feature_ai: bool,
    pub hardware_interval_ms: u32,
    /// "c" | "f"
    pub temperature_unit: String,

    // AI
    pub ai_provider: String,
    pub ai_providers: Vec<AiProvider>,
    pub ai_system_prompt: String,
    /// Ask the model for plain answers without the usual chatbot filler (see ai.rs).
    pub ai_plain_style: bool,
    /// "ai" | "web": what pressing Enter in the search bar does.
    pub enter_action: String,
    pub search_engine: String,
    pub search_custom_url: String,
    /// Web results used to ground AI answers: "none" | "searxng" | "brave" | "tavily"
    pub grounding_provider: String,
    pub searxng_url: String,
    pub grounding_results: u32,
    pub web_results_default: bool,

    // Updates
    /// Check GitHub for a newer release at startup and every few hours.
    pub update_check: bool,
    /// Download and install updates without asking (Peek restarts when the island is closed).
    pub update_auto_install: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            launch_at_login: false,
            show_on_startup: true,
            hide_in_fullscreen: true,
            collapse_on_blur: true,
            expand_on_hover: false,
            hover_delay_ms: 350,
            shortcut: "Alt+Shift+Space".into(),
            default_tab: "home".into(),
            reveal: "always".into(),

            mode: IslandMode::Island,
            style: "solid".into(),
            glass_opacity: 0.82,
            density: Density::Regular,
            island_size: SizePreset::Medium,
            dashboard_size: SizePreset::Medium,
            idle_content: "eyes".into(),
            show_media_activity: true,
            media_toast: true,
            visualizer: "audio".into(),
            clock_24h: false,

            monitor: String::new(),
            offset_x: 0,
            offset_y: 10,

            motion: "system".into(),
            animation_speed: 1.0,
            spring_bounce: 0.15,
            hover_effect: true,

            feature_media: true,
            feature_hardware: true,
            feature_ai: true,
            hardware_interval_ms: 1000,
            temperature_unit: "c".into(),

            ai_provider: "ollama".into(),
            ai_providers: default_providers(),
            ai_system_prompt:
                "You are Peek, an assistant built into a small panel at the top of a Windows \
desktop. Answer clearly and briefly. Use Markdown only when it helps."
                    .into(),
            ai_plain_style: true,
            enter_action: "ai".into(),
            search_engine: "google".into(),
            search_custom_url: "https://www.google.com/search?q=%s".into(),
            grounding_provider: "none".into(),
            searxng_url: "http://127.0.0.1:8888".into(),
            grounding_results: 5,
            web_results_default: false,

            update_check: true,
            update_auto_install: false,
        }
    }
}

impl Settings {
    /// Clamp values that come from the UI or a hand-edited file into safe ranges.
    fn sanitize(&mut self) {
        self.glass_opacity = self.glass_opacity.clamp(0.35, 1.0);
        self.animation_speed = self.animation_speed.clamp(0.4, 2.5);
        self.spring_bounce = self.spring_bounce.clamp(0.0, 0.5);
        if !["system", "full", "reduced", "off"].contains(&self.motion.as_str()) {
            self.motion = "system".into();
        }
        self.hover_delay_ms = self.hover_delay_ms.clamp(0, 2000);
        self.hardware_interval_ms = self.hardware_interval_ms.clamp(500, 10_000);
        self.offset_x = self.offset_x.clamp(-2000, 2000);
        self.offset_y = self.offset_y.clamp(0, 200);
        self.grounding_results = self.grounding_results.clamp(1, 10);
        if self.reveal != "always" && self.reveal != "hotkey" {
            self.reveal = "always".into();
        }
        if self.default_tab == "settings" {
            self.default_tab = "home".into();
        }
        // Make sure built-in providers exist even if the stored list predates them.
        for p in default_providers() {
            if !self.ai_providers.iter().any(|x| x.id == p.id) {
                self.ai_providers.push(p);
            }
        }
        if !self.ai_providers.iter().any(|p| p.id == self.ai_provider) {
            self.ai_provider = "ollama".into();
        }
    }

    pub fn provider(&self, id: Option<&str>) -> Option<AiProvider> {
        let id = id.unwrap_or(&self.ai_provider);
        self.ai_providers.iter().find(|p| p.id == id).cloned()
    }
}

pub struct SettingsStore {
    path: PathBuf,
    inner: RwLock<Settings>,
}

impl SettingsStore {
    pub fn load(app: &AppHandle) -> Self {
        let dir = app
            .path()
            .app_config_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("peek"));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("settings.json");
        let mut settings = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
            .unwrap_or_default();
        settings.sanitize();
        Self {
            path,
            inner: RwLock::new(settings),
        }
    }

    pub fn get(&self) -> Settings {
        self.inner.read().unwrap().clone()
    }

    fn save(&self, settings: &Settings) {
        match serde_json::to_string_pretty(settings) {
            Ok(json) => {
                let tmp = self.path.with_extension("json.tmp");
                if fs::write(&tmp, json).is_ok() {
                    let _ = fs::rename(&tmp, &self.path);
                }
            }
            Err(e) => log::error!("failed to serialize settings: {e}"),
        }
    }

    /// Merge a partial JSON object into the settings. Returns (old, new).
    pub fn patch(&self, patch: Value) -> Result<(Settings, Settings), String> {
        let mut guard = self.inner.write().unwrap();
        let old = guard.clone();
        let mut current = serde_json::to_value(&*guard).map_err(|e| e.to_string())?;
        match (current.as_object_mut(), patch) {
            (Some(obj), Value::Object(p)) => {
                for (k, v) in p {
                    obj.insert(k, v);
                }
            }
            _ => return Err("settings patch must be an object".into()),
        }
        let mut next: Settings = serde_json::from_value(current).map_err(|e| e.to_string())?;
        next.sanitize();
        *guard = next.clone();
        drop(guard);
        self.save(&next);
        Ok((old, next))
    }

    pub fn reset(&self) -> (Settings, Settings) {
        let mut guard = self.inner.write().unwrap();
        let old = guard.clone();
        let mut next = Settings::default();
        next.sanitize();
        *guard = next.clone();
        drop(guard);
        self.save(&next);
        (old, next)
    }
}

#[tauri::command]
pub fn get_settings(store: tauri::State<'_, SettingsStore>) -> Settings {
    store.get()
}

#[tauri::command]
pub fn update_settings(app: AppHandle, patch: Value) -> Result<Settings, String> {
    let store = app.state::<SettingsStore>();
    let (old, new) = store.patch(patch)?;
    if let Err(e) = crate::apply_settings(&app, &old, &new) {
        // Roll back the parts that failed (currently only the shortcut can fail).
        let _ = store.patch(serde_json::json!({ "shortcut": old.shortcut }));
        let _ = app.emit(SETTINGS_EVENT, store.get());
        return Err(e);
    }
    let _ = app.emit(SETTINGS_EVENT, &new);
    Ok(new)
}

#[tauri::command]
pub fn reset_settings(app: AppHandle) -> Settings {
    let store = app.state::<SettingsStore>();
    let (old, new) = store.reset();
    let _ = crate::apply_settings(&app, &old, &new);
    let _ = app.emit(SETTINGS_EVENT, &new);
    new
}
