//! API keys live in Windows Credential Manager, never in the settings file, and are
//! never sent back to the UI after they are saved.

const SERVICE: &str = "Peek";

fn valid_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.len() > 64
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_:.".contains(c))
    {
        return Err("invalid secret name".into());
    }
    Ok(())
}

#[cfg(windows)]
pub fn get(name: &str) -> Option<String> {
    keyring::Entry::new(SERVICE, name)
        .ok()?
        .get_password()
        .ok()
        .filter(|s| !s.is_empty())
}

#[cfg(windows)]
fn set(name: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())?;
    if value.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(value).map_err(|e| e.to_string())
    }
}

#[cfg(not(windows))]
pub fn get(name: &str) -> Option<String> {
    let _ = (SERVICE, name);
    None
}

#[cfg(not(windows))]
fn set(_name: &str, _value: &str) -> Result<(), String> {
    Err("secure storage is only implemented on Windows".into())
}

/// Store (or clear, when `value` is empty) a secret.
#[tauri::command]
pub async fn secret_set(name: String, value: String) -> Result<(), String> {
    valid_name(&name)?;
    tauri::async_runtime::spawn_blocking(move || set(&name, value.trim()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn secret_exists(name: String) -> Result<bool, String> {
    valid_name(&name)?;
    tauri::async_runtime::spawn_blocking(move || get(&name).is_some())
        .await
        .map_err(|e| e.to_string())
}
