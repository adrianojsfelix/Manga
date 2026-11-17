// The island's window: always on top, at the top centre of the screen the
// pointer is on when Manga starts (the main one otherwise), sized by the page
// to the island it draws (src/core/geometry.ts) — the window is never bigger
// than the island and its shadow, so the rest of the screen stays clickable.

use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewWindow};

pub const LABEL: &str = "island";

use manga_core::geometry::top_centre;

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// The page asks for its size; the window takes it and stays centred.
#[tauri::command]
pub fn island_layout(app: AppHandle, width: f64, height: f64) {
    let Some(win) = window(&app) else { return };
    if !(width.is_finite() && height.is_finite()) || width < 10.0 || height < 10.0 {
        return;
    }
    let monitor = win.current_monitor().ok().flatten().or_else(|| win.primary_monitor().ok().flatten());
    let _ = win.set_size(LogicalSize::new(width, height));
    if let Some(m) = monitor {
        let scale = m.scale_factor();
        let pos = m.position().to_logical::<f64>(scale);
        let size = m.size().to_logical::<f64>(scale);
        let (x, y) = top_centre(pos.x, pos.y, size.width, width);
        let _ = win.set_position(LogicalPosition::new(x, y));
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
}
