// Wi-Fi and Bluetooth on and off: Windows' radios, as the quick settings.

use serde::Serialize;

#[derive(Serialize)]
pub struct RadioInfo {
    /// "wifi" | "bluetooth".
    pub kind: &'static str,
    pub on: bool,
}

#[tauri::command]
pub async fn radios_get() -> Vec<RadioInfo> {
    tauri::async_runtime::spawn_blocking(imp::get).await.unwrap_or_default()
}

#[tauri::command]
pub async fn radio_set(kind: String, on: bool) -> bool {
    tauri::async_runtime::spawn_blocking(move || imp::set(&kind, on)).await.unwrap_or(false)
}

#[cfg(not(windows))]
mod imp {
    pub fn get() -> Vec<super::RadioInfo> {
        vec![]
    }
    pub fn set(_: &str, _: bool) -> bool {
        false
    }
}

#[cfg(windows)]
mod imp {
    use super::RadioInfo;
    use windows::core::Result;
    use windows::Devices::Radios::{Radio, RadioAccessStatus, RadioKind, RadioState};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    fn radios() -> Result<Vec<Radio>> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        if Radio::RequestAccessAsync()?.get()? != RadioAccessStatus::Allowed {
            return Ok(vec![]);
        }
        Ok(Radio::GetRadiosAsync()?.get()?.into_iter().collect())
    }

    fn kind(r: &Radio) -> Option<&'static str> {
        match r.Kind().ok()? {
            k if k == RadioKind::WiFi => Some("wifi"),
            k if k == RadioKind::Bluetooth => Some("bluetooth"),
            _ => None,
        }
    }

    pub fn get() -> Vec<RadioInfo> {
        let mut out: Vec<RadioInfo> = Vec::new();
        for r in radios().unwrap_or_default() {
            let Some(k) = kind(&r) else { continue };
            if out.iter().any(|x| x.kind == k) {
                continue;
            }
            out.push(RadioInfo { kind: k, on: r.State().map(|s| s == RadioState::On).unwrap_or(false) });
        }
        out
    }

    pub fn set(k: &str, on: bool) -> bool {
        let state = if on { RadioState::On } else { RadioState::Off };
        let mut done = false;
        for r in radios().unwrap_or_default() {
            if kind(&r) == Some(k) {
                done |= r.SetStateAsync(state).and_then(|op| op.get()).map(|s| s == RadioAccessStatus::Allowed).unwrap_or(false);
            }
        }
        done
    }
}
