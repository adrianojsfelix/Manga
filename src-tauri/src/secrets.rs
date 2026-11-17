// The API keys, in Windows' Credential Manager (never in a file or in git).
// The page can save, check and remove a key, never read one back: only Rust
// uses them, to call the APIs.

pub const SERVICE: &str = "app.manga.island";
/// The keys the app knows: anything else is refused.
pub const NAMES: [&str; 2] = ["anthropic", "gemini"];

fn known(name: &str) -> bool {
    NAMES.contains(&name)
}

#[cfg(windows)]
fn entry(name: &str) -> Option<keyring::Entry> {
    keyring::Entry::new(SERVICE, name).ok()
}

pub fn get(name: &str) -> Option<String> {
    if !known(name) {
        return None;
    }
    #[cfg(windows)]
    {
        entry(name)?.get_password().ok().filter(|k| !k.trim().is_empty())
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> bool {
    let value = value.trim();
    if !known(&name) || value.is_empty() || value.len() > 512 {
        return false;
    }
    #[cfg(windows)]
    {
        entry(&name).is_some_and(|e| e.set_password(value).is_ok())
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[tauri::command]
pub fn secret_has(name: String) -> bool {
    get(&name).is_some()
}

#[tauri::command]
pub fn secret_clear(name: String) -> bool {
    if !known(&name) {
        return false;
    }
    #[cfg(windows)]
    {
        entry(&name).is_some_and(|e| e.delete_credential().is_ok())
    }
    #[cfg(not(windows))]
    {
        false
    }
}
