// Manga's other windows, opened by the island: the alarm's card and the rest
// screen. Their page reads what to show from `window.__POPUP__`.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// place: "center" | "top" | "full" (the whole screen, for a rest).
#[tauri::command]
pub fn popup_open(app: AppHandle, label: String, page: String, data: serde_json::Value, width: f64, height: f64, place: String) -> Result<(), String> {
    if !matches!(label.as_str(), "alert" | "rest") || !matches!(page.as_str(), "alert.html" | "rest.html") {
        return Err("unknown window".into());
    }
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.close();
    }
    let monitor = app.primary_monitor().ok().flatten();
    let (mw, mh, scale) = monitor.as_ref().map(|m| (m.size().width as f64, m.size().height as f64, m.scale_factor())).unwrap_or((1920.0, 1080.0, 1.0));
    let (lw, lh) = (mw / scale, mh / scale);
    let (w, h, x, y) = match place.as_str() {
        "full" => (lw, lh, 0.0, 0.0),
        "top" => (width, height, (lw - width) / 2.0, 70.0),
        _ => (width, height, (lw - width) / 2.0, (lh - height) / 2.0),
    };
    let script = format!("window.__POPUP__ = {};", data);
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(page.into()))
        .title("Manga")
        .initialization_script(&script)
        .inner_size(w, h)
        .position(x, y)
        .additional_browser_args(crate::BROWSER_ARGS)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn popup_close(app: AppHandle, label: String) {
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.close();
    }
}

/// The user's own Pinterest (the home feed with the recommendations needs
/// their login: it only exists on the site). A window of its own; WebView2
/// keeps the login for next time. Only pinterest.com opens here.
#[tauri::command]
pub fn pinterest_open(app: AppHandle, path: Option<String>) -> Result<(), String> {
    let path = path.unwrap_or_default();
    if path.contains("://") || path.contains("..") {
        return Err("Endereço inválido.".into());
    }
    let url: tauri::Url = format!("https://www.pinterest.com/{}", path.trim_start_matches('/')).parse().map_err(|_| "Endereço inválido.")?;
    if let Some(w) = app.get_webview_window("pinterest") {
        let _ = w.navigate(url);
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "pinterest", WebviewUrl::External(url))
        .title("Pinterest — Manga")
        .additional_browser_args(crate::BROWSER_ARGS)
        .inner_size(480.0, 760.0)
        .min_inner_size(320.0, 400.0)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}
