// The control center's Windows shortcuts: lock, sleep, restart, shut down,
// dark mode, airplane mode, power mode, the Recycle Bin, and opening Windows'
// own pages and apps. Only known actions and pages: nothing arbitrary runs.

use serde::Serialize;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WinState {
    pub dark: Option<bool>,
    pub airplane: Option<bool>,
    /// "saver" | "balanced" | "performance".
    pub power: Option<String>,
    /// Items in the Recycle Bin, and their size.
    pub bin_items: u64,
    pub bin_bytes: u64,
}

const PAGES: [&str; 14] = [
    "ms-settings:display",
    "ms-settings:nightlight",
    "ms-settings:sound",
    "ms-settings:bluetooth",
    "ms-settings:network-wifi",
    "ms-settings:network-mobilehotspot",
    "ms-settings:project",
    "ms-settings:powersleep",
    "ms-settings:batterysaver",
    "ms-settings:quiethours",
    "ms-settings:personalization-colors",
    "ms-settings:",
    "ms-screenclip:",
    "ms-actioncenter:",
];

const APPS: [&str; 5] = ["calc.exe", "taskmgr.exe", "explorer.exe", "notepad.exe", "control.exe"];

#[tauri::command]
pub async fn win_state() -> WinState {
    tauri::async_runtime::spawn_blocking(imp::state).await.unwrap_or_default()
}

/// "lock" | "sleep" | "restart" | "shutdown" | "dark:on|off" | "airplane:on|off"
/// | "power:saver|balanced|performance" | "empty_bin" | "show_desktop" | an
/// ms-settings page | an app of the list.
#[tauri::command]
pub async fn win_action(action: String) -> bool {
    if PAGES.contains(&action.as_str()) || APPS.contains(&action.as_str()) {
        return crate::system::open_known(&action);
    }
    tauri::async_runtime::spawn_blocking(move || imp::act(&action)).await.unwrap_or(false)
}

/// Opens a web page in the browser (https only).
#[tauri::command]
pub fn open_url(url: String) -> bool {
    url.starts_with("https://") && crate::system::open_known(&url)
}

#[cfg(not(windows))]
mod imp {
    pub fn state() -> super::WinState {
        super::WinState::default()
    }
    pub fn act(_: &str) -> bool {
        false
    }
}

#[cfg(windows)]
mod imp {
    use super::WinState;
    use windows::core::{w, GUID, HSTRING};
    use windows::Devices::Radios::{Radio, RadioAccessStatus, RadioState};
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    use windows::Win32::System::Registry::{RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_DWORD, RRF_RT_REG_DWORD};
    use windows::Win32::System::Shutdown::LockWorkStation;
    use windows::Win32::UI::Shell::{SHEmptyRecycleBinW, SHQueryRecycleBinW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND, SHQUERYRBINFO};
    use windows::Win32::UI::WindowsAndMessaging::{SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE};

    const THEME: windows::core::PCWSTR = w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize");

    // Windows' power modes (the overlays of the Settings slider).
    const SAVER: GUID = GUID::from_u128(0x961cc777_2547_4f9d_8174_7d86181b8a7a);
    const BALANCED: GUID = GUID::from_u128(0x00000000_0000_0000_0000_000000000000);
    const PERFORMANCE: GUID = GUID::from_u128(0xded574b5_45a0_4f42_8737_46345c09c238);

    type GetOverlay = unsafe extern "system" fn(*mut GUID) -> u32;
    type SetOverlay = unsafe extern "system" fn(GUID) -> u32;

    fn overlay() -> Option<(GetOverlay, SetOverlay)> {
        use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
        unsafe {
            let lib = LoadLibraryW(w!("powrprof.dll")).ok()?;
            let g = GetProcAddress(lib, windows::core::s!("PowerGetEffectiveOverlayScheme"))?;
            let s = GetProcAddress(lib, windows::core::s!("PowerSetActiveOverlayScheme"))?;
            Some((std::mem::transmute(g), std::mem::transmute(s)))
        }
    }

    fn dword(name: windows::core::PCWSTR) -> Option<u32> {
        let mut v = 0u32;
        let mut size = 4u32;
        unsafe { RegGetValueW(HKEY_CURRENT_USER, THEME, name, RRF_RT_REG_DWORD, None, Some(&mut v as *mut u32 as *mut _), Some(&mut size)).ok().ok()? };
        Some(v)
    }

    fn radios() -> Vec<Radio> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let ok = Radio::RequestAccessAsync().and_then(|o| o.get()).map(|s| s == RadioAccessStatus::Allowed).unwrap_or(false);
        if !ok {
            return vec![];
        }
        Radio::GetRadiosAsync().and_then(|o| o.get()).map(|l| l.into_iter().collect()).unwrap_or_default()
    }

    pub fn state() -> WinState {
        let mut s = WinState { dark: dword(w!("AppsUseLightTheme")).map(|v| v == 0), ..Default::default() };
        let rs = radios();
        if !rs.is_empty() {
            s.airplane = Some(rs.iter().all(|r| r.State().map(|x| x != RadioState::On).unwrap_or(true)));
        }
        if let Some((get, _)) = overlay() {
            let mut g = GUID::zeroed();
            if unsafe { get(&mut g) } == 0 {
                s.power = Some(if g == SAVER { "saver" } else if g == PERFORMANCE { "performance" } else { "balanced" }.into());
            }
        }
        let mut info = SHQUERYRBINFO { cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32, ..Default::default() };
        if unsafe { SHQueryRecycleBinW(w!(""), &mut info) }.is_ok() {
            s.bin_items = info.i64NumItems as u64;
            s.bin_bytes = info.i64Size as u64;
        }
        s
    }

    fn set_dark(on: bool) -> bool {
        let v: u32 = if on { 0 } else { 1 };
        let bytes = v.to_le_bytes();
        unsafe {
            let a = RegSetKeyValueW(HKEY_CURRENT_USER, THEME, w!("AppsUseLightTheme"), REG_DWORD.0, Some(bytes.as_ptr() as *const _), 4).is_ok();
            let b = RegSetKeyValueW(HKEY_CURRENT_USER, THEME, w!("SystemUsesLightTheme"), REG_DWORD.0, Some(bytes.as_ptr() as *const _), 4).is_ok();
            let msg = HSTRING::from("ImmersiveColorSet");
            let _ = SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, WPARAM(0), LPARAM(msg.as_ptr() as isize), SMTO_ABORTIFHUNG, 200, None);
            a && b
        }
    }

    fn shutdown(args: &[&str]) -> bool {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("shutdown").args(args).creation_flags(0x0800_0000).spawn().is_ok()
    }

    pub fn act(action: &str) -> bool {
        match action {
            "lock" => unsafe { LockWorkStation().is_ok() },
            "sleep" => {
                use std::os::windows::process::CommandExt;
                std::process::Command::new("rundll32.exe").args(["powrprof.dll,SetSuspendState", "0,1,0"]).creation_flags(0x0800_0000).spawn().is_ok()
            }
            "restart" => shutdown(&["/r", "/t", "0"]),
            "shutdown" => shutdown(&["/s", "/t", "0"]),
            "dark:on" => set_dark(true),
            "dark:off" => set_dark(false),
            "airplane:on" | "airplane:off" => {
                let state = if action.ends_with("on") { RadioState::Off } else { RadioState::On };
                radios().iter().fold(false, |done, r| done | r.SetStateAsync(state).and_then(|o| o.get()).is_ok())
            }
            "empty_bin" => unsafe { SHEmptyRecycleBinW(None::<HWND>, w!(""), SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND).is_ok() },
            "show_desktop" => crate::system::open_known("shell:::{3080F90D-D7AD-11D9-BD98-0000947B0257}"),
            a if a.starts_with("power:") => {
                let Some((_, set)) = overlay() else { return false };
                let g = match &a[6..] {
                    "saver" => SAVER,
                    "performance" => PERFORMANCE,
                    _ => BALANCED,
                };
                unsafe { set(g) == 0 }
            }
            _ => false,
        }
    }
}
