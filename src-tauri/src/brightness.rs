// Each screen's brightness: a laptop's own screen through WMI (asked of
// PowerShell, no window), external monitors through DDC/CI (Windows' dxva2,
// the monitor's own setting). A monitor that does not answer DDC/CI is left out.

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct Screen {
    /// "internal" or "ddc:<n>".
    pub id: String,
    pub name: String,
    /// 0–100.
    pub value: u8,
}

#[tauri::command]
pub async fn brightness_list() -> Vec<Screen> {
    let mut out = Vec::new();
    if let Some(v) = internal_get().await {
        out.push(Screen { id: "internal".into(), name: "Tela do notebook".into(), value: v });
    }
    out.extend(tauri::async_runtime::spawn_blocking(imp::ddc_list).await.unwrap_or_default());
    out
}

#[tauri::command]
pub async fn brightness_set(id: String, value: u8) -> bool {
    let v = value.min(100);
    if id == "internal" {
        return internal_set(v).await;
    }
    let Some(n) = id.strip_prefix("ddc:").and_then(|n| n.parse::<usize>().ok()) else { return false };
    tauri::async_runtime::spawn_blocking(move || imp::ddc_set(n, v)).await.unwrap_or(false)
}

async fn internal_get() -> Option<u8> {
    let out = run("(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness").await?;
    out.trim().parse().ok()
}

async fn internal_set(v: u8) -> bool {
    run(&format!(
        "Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{{Timeout=0;Brightness={v}}} | Out-Null; 'ok'"
    ))
    .await
    .is_some()
}

pub async fn run(script: &str) -> Option<String> {
    let mut cmd = tokio::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let out = cmd.output().await.ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!text.is_empty()).then_some(text)
}

#[cfg(not(windows))]
mod imp {
    pub fn ddc_list() -> Vec<super::Screen> {
        vec![]
    }
    pub fn ddc_set(_: usize, _: u8) -> bool {
        false
    }
}

#[cfg(windows)]
mod imp {
    use super::Screen;
    use windows::core::BOOL;
    use windows::Win32::Devices::Display::{
        DestroyPhysicalMonitors, GetMonitorBrightness, GetNumberOfPhysicalMonitorsFromHMONITOR, GetPhysicalMonitorsFromHMONITOR, SetMonitorBrightness, PHYSICAL_MONITOR,
    };
    use windows::Win32::Foundation::{LPARAM, RECT};
    use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, HDC, HMONITOR};

    unsafe extern "system" fn each(m: HMONITOR, _: HDC, _: *mut RECT, list: LPARAM) -> BOOL {
        let list = &mut *(list.0 as *mut Vec<HMONITOR>);
        list.push(m);
        true.into()
    }

    /// Every physical monitor, in order, with what to do with each.
    fn with_monitors<T>(mut f: impl FnMut(usize, &PHYSICAL_MONITOR) -> Option<T>) -> Vec<T> {
        let mut hs: Vec<HMONITOR> = Vec::new();
        let mut out = Vec::new();
        unsafe {
            let _ = EnumDisplayMonitors(None, None, Some(each), LPARAM(&mut hs as *mut _ as isize));
            let mut n = 0usize;
            for h in hs {
                let mut count = 0u32;
                if GetNumberOfPhysicalMonitorsFromHMONITOR(h, &mut count).is_err() || count == 0 {
                    continue;
                }
                let mut list = vec![PHYSICAL_MONITOR::default(); count as usize];
                if GetPhysicalMonitorsFromHMONITOR(h, &mut list).is_err() {
                    continue;
                }
                for pm in &list {
                    if let Some(v) = f(n, pm) {
                        out.push(v);
                    }
                    n += 1;
                }
                let _ = DestroyPhysicalMonitors(&list);
            }
        }
        out
    }

    pub fn ddc_list() -> Vec<Screen> {
        with_monitors(|n, pm| unsafe {
            let (mut min, mut cur, mut max) = (0u32, 0u32, 0u32);
            if GetMonitorBrightness(pm.hPhysicalMonitor, &mut min, &mut cur, &mut max) == 0 || max <= min {
                return None;
            }
            let raw = pm.szPhysicalMonitorDescription;
            let desc = String::from_utf16_lossy(&raw).trim_end_matches('\0').trim().to_string();
            let name = if desc.is_empty() || desc.contains("Generic") || desc.contains("Genérico") { format!("Monitor {}", n + 1) } else { desc };
            Some(Screen { id: format!("ddc:{n}"), name, value: (((cur - min) * 100) / (max - min)) as u8 })
        })
    }

    pub fn ddc_set(target: usize, v: u8) -> bool {
        !with_monitors(|n, pm| unsafe {
            if n != target {
                return None;
            }
            let (mut min, mut cur, mut max) = (0u32, 0u32, 0u32);
            if GetMonitorBrightness(pm.hPhysicalMonitor, &mut min, &mut cur, &mut max) == 0 {
                return None;
            }
            (SetMonitorBrightness(pm.hPhysicalMonitor, min + (max - min) * v as u32 / 100) != 0).then_some(())
        })
        .is_empty()
    }
}
