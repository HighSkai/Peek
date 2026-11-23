//! Updates from the GitHub releases of this project: check, download, verify, install.
//!
//! Peek's installers aren't code-signed, so instead of Tauri's signature-based updater
//! this downloads the NSIS installer attached to the latest release (only from this
//! repository's release downloads), checks its size and the SHA-256 digest GitHub
//! publishes for every release asset, runs it silently and starts Peek again.

use std::{io::Write, path::Path, time::Duration};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{ipc::Channel, AppHandle, Manager};

const RELEASES_API: &str = "https://api.github.com/repos/HighSkai/Peek/releases/latest";
const RELEASES_PAGE: &str = "https://github.com/HighSkai/Peek/releases";
const DOWNLOAD_PREFIX: &str = "https://github.com/HighSkai/Peek/releases/download/";
const INSTALLER_SUFFIX: &str = "_x64-setup.exe";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub url: String,
    pub available: bool,
    /// Release notes (Markdown).
    pub notes: String,
    pub published_at: Option<String>,
    /// Size of the Windows installer, when the release has one.
    pub download_size: Option<u64>,
}

#[derive(Debug, Clone)]
struct Installer {
    name: String,
    url: String,
    size: u64,
    /// Lowercase hex SHA-256 from the asset's `digest`, when GitHub provides it.
    sha256: Option<String>,
}

struct Release {
    info: UpdateInfo,
    installer: Option<Installer>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum UpdateEvent {
    Progress { downloaded: u64, total: u64 },
    Installing,
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

async fn fetch_latest(app: &AppHandle) -> Result<Release, String> {
    let current = app.package_info().version.to_string();
    let client = app.state::<crate::ai::AiState>().client().clone();
    let resp = client
        .get(RELEASES_API)
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach GitHub: {e}"))?;
    match resp.status().as_u16() {
        404 => {
            return Ok(Release {
                info: UpdateInfo {
                    latest: current.clone(),
                    current,
                    url: RELEASES_PAGE.into(),
                    available: false,
                    notes: String::new(),
                    published_at: None,
                    download_size: None,
                },
                installer: None,
            })
        }
        403 | 429 => return Err("GitHub is limiting requests right now. Try again later.".into()),
        _ => {}
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
    let url = v["html_url"].as_str().unwrap_or(RELEASES_PAGE).to_string();
    let notes = v["body"].as_str().unwrap_or_default().to_string();
    let published_at = v["published_at"].as_str().map(str::to_string);
    let installer = v["assets"].as_array().and_then(|assets| {
        assets.iter().find_map(|a| {
            let name = a["name"].as_str()?;
            let download = a["browser_download_url"].as_str()?;
            if !name.ends_with(INSTALLER_SUFFIX) || !download.starts_with(DOWNLOAD_PREFIX) {
                return None;
            }
            let sha256 = a["digest"]
                .as_str()
                .and_then(|d| d.strip_prefix("sha256:"))
                .map(|d| d.to_ascii_lowercase());
            Some(Installer {
                name: name.to_string(),
                url: download.to_string(),
                size: a["size"].as_u64().unwrap_or(0),
                sha256,
            })
        })
    });

    let available = !latest.is_empty() && parse(&latest) > parse(&current);
    let download_size = installer.as_ref().map(|i| i.size);
    Ok(Release {
        info: UpdateInfo {
            current,
            latest,
            url,
            available,
            notes,
            published_at,
            download_size,
        },
        installer,
    })
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateInfo, String> {
    Ok(fetch_latest(&app).await?.info)
}

/// Download the latest installer, verify it, run it silently and quit. The installer
/// replaces Peek in place and Peek starts again afterwards.
#[tauri::command]
pub async fn install_update(app: AppHandle, on_event: Channel<UpdateEvent>) -> Result<(), String> {
    // Look the release up again here rather than trusting anything from the UI.
    let release = fetch_latest(&app).await?;
    if !release.info.available {
        return Err("Peek is already up to date.".into());
    }
    let installer = release
        .installer
        .ok_or("This release doesn't include a Windows installer yet.")?;

    let dir = std::env::temp_dir().join("peek-update");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe_name = installer
        .name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c));
    let path = dir.join(if safe_name {
        installer.name.as_str()
    } else {
        "Peek-setup.exe"
    });

    let client = app.state::<crate::ai::AiState>().client().clone();
    let resp = client
        .get(&installer.url)
        .timeout(Duration::from_secs(600))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("The download failed: {e}"))?;
    let total = resp.content_length().unwrap_or(installer.size);

    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut reported: u64 = 0;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                drop(file);
                discard(&path);
                return Err(format!("The download failed: {e}"));
            }
        };
        if let Err(e) = file.write_all(&chunk) {
            drop(file);
            discard(&path);
            return Err(e.to_string());
        }
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
        if downloaded - reported >= 128 * 1024 || downloaded == total {
            reported = downloaded;
            let _ = on_event.send(UpdateEvent::Progress { downloaded, total });
        }
    }
    let flushed = file.flush();
    drop(file);
    if let Err(e) = flushed {
        discard(&path);
        return Err(e.to_string());
    }

    if installer.size > 0 && downloaded != installer.size {
        discard(&path);
        return Err("The download was incomplete. Try again.".into());
    }
    if let Some(expected) = &installer.sha256 {
        let actual: String = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        if &actual != expected {
            discard(&path);
            return Err(
                "The download didn't match the release's checksum, so it wasn't installed.".into(),
            );
        }
    }

    let _ = on_event.send(UpdateEvent::Installing);
    platform::launch_installer(&path)?;
    // Let the UI show "Installing", then quit so the installer can replace Peek's files.
    tokio::time::sleep(Duration::from_millis(400)).await;
    crate::quit(&app);
    Ok(())
}

fn discard(path: &Path) {
    let _ = std::fs::remove_file(path);
}

#[cfg(windows)]
mod platform {
    use std::{os::windows::process::CommandExt, path::Path, process::Command};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    /// Run the installer silently once Peek has exited, then start Peek again.
    /// `ping` is the usual way to wait in cmd without a console (`timeout` needs one).
    /// `--updated` keeps the restart quiet if the installer already started Peek.
    pub fn launch_installer(installer: &Path) -> Result<(), String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let script = format!(
            "ping -n 3 127.0.0.1 >nul & start \"\" /wait \"{}\" /S /UPDATE & start \"\" \"{}\" --updated",
            installer.display(),
            exe.display()
        );
        Command::new("cmd.exe")
            .raw_arg(format!("/D /S /C \"{script}\""))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Couldn't start the installer: {e}"))
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn launch_installer(_installer: &std::path::Path) -> Result<(), String> {
        Err("Updates can only be installed on Windows.".into())
    }
}
