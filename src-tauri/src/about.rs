// About Manga: its version, a new one on GitHub (the releases of the
// project's repository: only the address is asked, nothing is sent), and
// starting with Windows (the user's own Run key, no admin).

use manga_core::update::{is_newer, parse_release, Release};
use tauri::AppHandle;

pub const REPO: &str = "adrianojsfelix/Manga";

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// The newest release when it is newer than this one; None when up to date.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<Release>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .user_agent("Manga")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(format!("https://api.github.com/repos/{REPO}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Sem conexão: {e}"))?;
    if resp.status().as_u16() == 404 {
        return Err("Ainda não há versões publicadas (ou o repositório é privado).".into());
    }
    if !resp.status().is_success() {
        return Err(format!("O GitHub respondeu {}.", resp.status().as_u16()));
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let release = parse_release(&text).ok_or("Não entendi a resposta do GitHub.")?;
    let current = app.package_info().version.to_string();
    Ok(is_newer(&release.version, &current).then_some(release))
}

#[tauri::command]
pub fn autostart_get() -> bool {
    imp::get()
}

#[tauri::command]
pub fn autostart_set(on: bool) -> bool {
    imp::set(on)
}

#[cfg(not(windows))]
mod imp {
    pub fn get() -> bool {
        false
    }
    pub fn set(_: bool) -> bool {
        false
    }
}

#[cfg(windows)]
mod imp {
    use windows::core::{w, HSTRING};
    use windows::Win32::System::Registry::{RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ};

    const RUN: windows::core::PCWSTR = w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
    const NAME: windows::core::PCWSTR = w!("Manga");

    pub fn get() -> bool {
        let mut size = 0u32;
        unsafe { RegGetValueW(HKEY_CURRENT_USER, RUN, NAME, RRF_RT_REG_SZ, None, None, Some(&mut size)).is_ok() }
    }

    pub fn set(on: bool) -> bool {
        unsafe {
            if !on {
                let r = RegDeleteKeyValueW(HKEY_CURRENT_USER, RUN, NAME);
                return r.is_ok() || !get();
            }
            let Ok(exe) = std::env::current_exe() else { return false };
            let value = HSTRING::from(format!("\"{}\"", exe.display()));
            let bytes = std::slice::from_raw_parts(value.as_ptr() as *const u8, (value.len() + 1) * 2);
            RegSetKeyValueW(HKEY_CURRENT_USER, RUN, NAME, REG_SZ.0, Some(bytes.as_ptr() as *const _), bytes.len() as u32).is_ok()
        }
    }
}
