// Picture-in-picture for any app: a small window always on top that shows,
// live, the window where the video plays — Windows' own thumbnail (DWM), the
// same Alt+Tab draws. Manga picks the window showing what plays; the user
// can pick another. A bar at the bottom (the page pip.html) has the controls.

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// The controls' bar under the picture, in CSS pixels.
pub const BAR: f64 = 40.0;

#[derive(Serialize, Clone)]
pub struct Source {
    pub id: isize,
    pub title: String,
    pub app: String,
}

/// The windows that can be shown, the best match for what plays first.
#[tauri::command]
pub fn pip_windows() -> Vec<Source> {
    imp::windows()
}

/// Opens the PiP window on a window (or the one showing what plays).
#[tauri::command]
pub fn pip_open(app: AppHandle, source: Option<isize>) -> Result<Source, String> {
    let list = imp::windows();
    let src = match source {
        Some(id) => list.into_iter().find(|s| s.id == id),
        None => list.into_iter().next(),
    }
    .ok_or("Não achei a janela do que está tocando.")?;

    let win = match app.get_webview_window("pip") {
        Some(w) => w,
        None => {
            let w = WebviewWindowBuilder::new(&app, "pip", WebviewUrl::App("pip.html".into()))
                .title("Manga PiP")
                .inner_size(480.0, 270.0 + BAR)
                .min_inner_size(240.0, 135.0 + BAR)
                .additional_browser_args(crate::BROWSER_ARGS)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(true)
                .transparent(false)
                .build()
                .map_err(|e| e.to_string())?;
            let again = w.clone();
            w.on_window_event(move |e| match e {
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. } => imp::fit(&again),
                tauri::WindowEvent::Destroyed => imp::release(),
                _ => {}
            });
            w
        }
    };
    imp::show(&win, src.id)?;
    let _ = win.show();
    Ok(src)
}

#[tauri::command]
pub fn pip_close(app: AppHandle) {
    imp::release();
    if let Some(w) = app.get_webview_window("pip") {
        let _ = w.close();
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn windows() -> Vec<super::Source> {
        vec![]
    }
    pub fn show(_: &tauri::WebviewWindow, _: isize) -> Result<(), String> {
        Err("Só no Windows.".into())
    }
    pub fn fit(_: &tauri::WebviewWindow) {}
    pub fn release() {}
}

#[cfg(windows)]
mod imp {
    use super::{Source, BAR};
    use crate::audio::exe_of_window;
    use manga_core::media::{app_label, window_score, Candidate};
    use std::sync::Mutex;
    use windows::Win32::Foundation::{HWND, LPARAM, RECT, SIZE};
    use windows::Win32::Graphics::Dwm::{
        DwmGetWindowAttribute, DwmQueryThumbnailSourceSize, DwmRegisterThumbnail, DwmUnregisterThumbnail, DwmUpdateThumbnailProperties, DWMWA_CLOAKED,
        DWM_THUMBNAIL_PROPERTIES, DWM_TNP_OPACITY, DWM_TNP_RECTDESTINATION, DWM_TNP_SOURCECLIENTAREAONLY, DWM_TNP_VISIBLE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetClientRect, GetWindowTextLengthW, GetWindowTextW, IsWindowVisible, GetWindowThreadProcessId};
    use windows::core::BOOL;

    /// The thumbnail being shown (DWM's handle), 0 for none.
    static THUMB: Mutex<isize> = Mutex::new(0);

    unsafe extern "system" fn each(hwnd: HWND, list: LPARAM) -> BOOL {
        let list = &mut *(list.0 as *mut Vec<(isize, String, u32)>);
        if !IsWindowVisible(hwnd).as_bool() {
            return true.into();
        }
        let mut cloaked = 0u32;
        let _ = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut _, 4);
        if cloaked != 0 {
            return true.into();
        }
        let n = GetWindowTextLengthW(hwnd);
        if n <= 0 {
            return true.into();
        }
        let mut buf = vec![0u16; n as usize + 1];
        let got = GetWindowTextW(hwnd, &mut buf);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        list.push((hwnd.0 as isize, String::from_utf16_lossy(&buf[..got as usize]), pid));
        true.into()
    }

    pub fn windows() -> Vec<Source> {
        let mut raw: Vec<(isize, String, u32)> = Vec::new();
        unsafe {
            let _ = EnumWindows(Some(each), LPARAM(&mut raw as *mut _ as isize));
        }
        let me = std::process::id();
        let playing = crate::media::now();
        let (app, title) = playing.map(|m| (m.app, m.title)).unwrap_or_default();
        let mut scored: Vec<(u32, Source)> = raw
            .into_iter()
            .filter(|(_, t, pid)| *pid != me && t != "Program Manager")
            .map(|(id, t, pid)| {
                let exe = exe_of_window(pid);
                let file = exe.rsplit(['\\', '/']).next().unwrap_or("").to_string();
                let score = window_score(&Candidate { title: &t, exe: &file }, &app, &title);
                (score, Source { id, title: t, app: app_label(&exe) })
            })
            .collect();
        scored.sort_by(|a, b| b.0.cmp(&a.0));
        scored.into_iter().map(|(_, s)| s).collect()
    }

    fn hwnd_of(w: &tauri::WebviewWindow) -> Option<HWND> {
        w.hwnd().ok().map(|h| HWND(h.0 as _))
    }

    pub fn release() {
        let mut t = THUMB.lock().unwrap();
        if *t != 0 {
            unsafe {
                let _ = DwmUnregisterThumbnail(*t);
            }
            *t = 0;
        }
    }

    pub fn show(w: &tauri::WebviewWindow, source: isize) -> Result<(), String> {
        release();
        let dest = hwnd_of(w).ok_or("Sem janela.")?;
        let id = unsafe { DwmRegisterThumbnail(dest, HWND(source as _)) }.map_err(|e| format!("O Windows não deixou mostrar essa janela ({e})."))?;
        *THUMB.lock().unwrap() = id;
        fit(w);
        Ok(())
    }

    /// Puts the picture above the bar, keeping its proportions.
    pub fn fit(w: &tauri::WebviewWindow) {
        let id = *THUMB.lock().unwrap();
        let Some(dest) = hwnd_of(w) else { return };
        if id == 0 {
            return;
        }
        unsafe {
            let mut client = RECT::default();
            if GetClientRect(dest, &mut client).is_err() {
                return;
            }
            let scale = w.scale_factor().unwrap_or(1.0);
            let bar = (BAR * scale).round() as i32;
            let (cw, ch) = (client.right, (client.bottom - bar).max(1));
            let src: SIZE = DwmQueryThumbnailSourceSize(id).unwrap_or(SIZE { cx: cw, cy: ch });
            let k = (cw as f64 / src.cx.max(1) as f64).min(ch as f64 / src.cy.max(1) as f64);
            let (w2, h2) = ((src.cx as f64 * k) as i32, (src.cy as f64 * k) as i32);
            let (x, y) = ((cw - w2) / 2, (ch - h2) / 2);
            let props = DWM_THUMBNAIL_PROPERTIES {
                dwFlags: DWM_TNP_RECTDESTINATION | DWM_TNP_VISIBLE | DWM_TNP_OPACITY | DWM_TNP_SOURCECLIENTAREAONLY,
                rcDestination: RECT { left: x, top: y, right: x + w2, bottom: y + h2 },
                opacity: 255,
                fVisible: true.into(),
                fSourceClientAreaOnly: true.into(),
                ..Default::default()
            };
            let _ = DwmUpdateThumbnailProperties(id, &props);
        }
    }
}
