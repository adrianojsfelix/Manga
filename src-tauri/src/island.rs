// The island's window: always on top, at the top centre of a screen — the
// one the user picked, or the main one — sized by the page to the island it
// draws (src/core/geometry.ts): the window is never bigger than the island
// and its shadow, so the rest of the screen stays clickable. It steps aside
// while an app is in full screen, when the user wants it so.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Monitor, WebviewWindow};

pub const LABEL: &str = "island";

use manga_core::geometry::top_centre;

/// "current" (where it is), "primary", or a monitor's number.
static MONITOR: Mutex<String> = Mutex::new(String::new());

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

fn chosen(win: &WebviewWindow) -> Option<Monitor> {
    let choice = MONITOR.lock().unwrap().clone();
    let current = || win.current_monitor().ok().flatten().or_else(|| win.primary_monitor().ok().flatten());
    match choice.as_str() {
        "primary" => win.primary_monitor().ok().flatten().or_else(current),
        n => match n.parse::<usize>() {
            Ok(i) => win.available_monitors().ok().and_then(|l| l.into_iter().nth(i)).or_else(current),
            Err(_) => current(),
        },
    }
}

/// The page asks for its size; the window takes it and stays centred.
#[tauri::command]
pub fn island_layout(app: AppHandle, width: f64, height: f64) {
    let Some(win) = window(&app) else { return };
    if !(width.is_finite() && height.is_finite()) || width < 10.0 || height < 10.0 {
        return;
    }
    let _ = win.set_size(LogicalSize::new(width, height));
    if let Some(m) = chosen(&win) {
        let scale = m.scale_factor();
        let pos = m.position().to_logical::<f64>(scale);
        let size = m.size().to_logical::<f64>(scale);
        let (x, y) = top_centre(pos.x, pos.y, size.width, width);
        let _ = win.set_position(LogicalPosition::new(x, y));
    }
}

#[derive(Serialize)]
pub struct MonitorInfo {
    pub index: usize,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub primary: bool,
}

#[tauri::command]
pub fn monitors(app: AppHandle) -> Vec<MonitorInfo> {
    let Some(win) = window(&app) else { return vec![] };
    let primary = win.primary_monitor().ok().flatten().map(|m| *m.position());
    win.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(index, m)| MonitorInfo {
            index,
            name: m.name().cloned().unwrap_or_default().trim_start_matches("\\\\.\\").to_string(),
            width: m.size().width,
            height: m.size().height,
            primary: Some(*m.position()) == primary,
        })
        .collect()
}

/// Which screen the island lives on: "current", "primary" or a number.
#[tauri::command]
pub fn island_monitor(choice: String) {
    *MONITOR.lock().unwrap() = choice;
}

/// Shows or hides the island (full screen, the user's choice).
#[tauri::command]
pub fn island_visible(app: AppHandle, on: bool) {
    if let Some(w) = window(&app) {
        let _ = if on { w.show() } else { w.hide() };
    }
}

/// A text field in the island takes the keyboard; giving it back leaves the
/// app the user was in where it was.
#[tauri::command]
pub fn island_focus(app: AppHandle, on: bool) {
    let Some(win) = window(&app) else { return };
    let _ = win.set_focusable(on);
    if on {
        let _ = win.set_focus();
    }
}

pub fn setup(app: &AppHandle) {
    if let Some(win) = window(app) {
        // Never in the way of the app in front: no focus until a field asks.
        let _ = win.set_focusable(false);
        let _ = win.set_always_on_top(true);
    }
    full_screen::watch(app.clone());
}

mod full_screen {
    #[cfg(not(windows))]
    pub fn watch(_: tauri::AppHandle) {}

    /// Tells the page when an app takes the whole screen the island is on.
    #[cfg(windows)]
    pub fn watch(app: tauri::AppHandle) {
        use manga_core::geometry::covers;
        use std::time::Duration;
        use tauri::{Emitter, Manager};
        use windows::Win32::Foundation::{HWND, RECT};
        use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
        use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect};

        std::thread::spawn(move || {
            let mut last = false;
            loop {
                std::thread::sleep(Duration::from_millis(700));
                let island = app.get_webview_window(super::LABEL).and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize).unwrap_or(0);
                let full = unsafe {
                    let fg = GetForegroundWindow();
                    if fg.0.is_null() || fg.0 as isize == island {
                        last
                    } else {
                        let mut class = [0u16; 64];
                        let n = GetClassNameW(fg, &mut class) as usize;
                        let class = String::from_utf16_lossy(&class[..n]);
                        // The desktop and the taskbar are not "full screen".
                        if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
                            false
                        } else {
                            let mut r = RECT::default();
                            let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
                            let m = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
                            // Only the screen the island is on matters.
                            let same = island == 0 || MonitorFromWindow(HWND(island as _), MONITOR_DEFAULTTONEAREST) == m;
                            GetWindowRect(fg, &mut r).is_ok()
                                && GetMonitorInfoW(m, &mut mi).as_bool()
                                && same
                                && covers((r.left, r.top, r.right, r.bottom), (mi.rcMonitor.left, mi.rcMonitor.top, mi.rcMonitor.right, mi.rcMonitor.bottom))
                        }
                    }
                };
                if full != last {
                    last = full;
                    let _ = app.emit("fullscreen", full);
                }
            }
        });
    }
}
