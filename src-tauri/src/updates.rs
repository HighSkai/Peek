//! "Check for updates" against the GitHub releases of this project.

use serde::Serialize;
use tauri::{AppHandle, Manager};

const RELEASES_API: &str = "https://api.github.com/repos/HighSkai/Peek/releases/latest";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub url: String,
    pub available: bool,
}

fn parse(v: &str) -> (u64, u64, u64) {
    let mut it = v
        .trim_start_matches(['v', 'V'])
        .split(['.', '-', '+'])
        .map(|p| p.parse::<u64>().unwrap_or(0));
    (
        it.next().unwrap_or(0),
        it.next().unwrap_or(0),
        it.next().unwrap_or(0),
    )
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateInfo, String> {
    let current = app.package_info().version.to_string();
    let client = app.state::<crate::ai::AiState>().client().clone();
    let resp = client
        .get(RELEASES_API)
        .header("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().as_u16() == 404 {
        return Ok(UpdateInfo {
            latest: current.clone(),
            current,
            url: "https://github.com/HighSkai/Peek/releases".into(),
            available: false,
        });
    }
    let v: serde_json::Value = resp
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let latest = v["tag_name"]
        .as_str()
        .unwrap_or_default()
        .trim_start_matches('v')
        .to_string();
    let url = v["html_url"]
        .as_str()
        .unwrap_or("https://github.com/HighSkai/Peek/releases")
        .to_string();
    Ok(UpdateInfo {
        available: !latest.is_empty() && parse(&latest) > parse(&current),
        current,
        latest,
        url,
    })
}
