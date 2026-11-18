// Manga: an island at the top of Windows.

mod about;
mod actions;
mod audio;
mod brightness;
mod chat;
mod desk;
mod claude_code;
mod island;
mod media;
mod notifications;
mod pip;
mod popup;
mod radios;
mod secrets;
mod sysinfo;
mod system;
#[cfg(windows)]
mod winsqlite;

use tauri::menu::{Menu, MenuItem};

/// WebView2's options, the same for every window (it refuses windows that
/// differ): the island's, from tauri.conf.json, so the focus music can play.
pub const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";
use tauri::tray::TrayIconBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            island::island_layout,
            island::island_focus,
            about::app_version,
            about::update_check,
            about::autostart_get,
            about::autostart_set,
            island::monitors,
            island::island_monitor,
            island::island_visible,
            secrets::secret_set,
            secrets::secret_has,
            secrets::secret_clear,
            chat::chat_send,
            chat::chat_cancel,
            notifications::notifications_watch,
            claude_code::claude_code_answer,
            claude_code::claude_code_status,
            claude_code::claude_code_connect,
            media::media_control,
            audio::sound_get,
            audio::sound_set,
            audio::sound_level,
            radios::radios_get,
            radios::radio_set,
            brightness::brightness_list,
            brightness::brightness_set,
            pip::pip_windows,
            pip::pip_open,
            pip::pip_close,
            pip::media_live,
            pip::media_live_off,
            system::fetch_text,
            system::file_icon,
            desk::keyboard_get,
            desk::keyboard_set,
            desk::apps_open,
            desk::app_window,
            desk::apps_pinned,
            desk::app_launch,
            desk::clipboard_history,
            desk::clipboard_use,
            desk::clipboard_clear,
            desk::clipboard_watch,
            desk::copy_files,
            system::locks_get,
            system::open_path,
            system::downloads_folder,
            system::app_icon,
            system::download_url,
            popup::popup_open,
            popup::popup_close,
            sysinfo::sysinfo,
            actions::win_state,
            actions::win_action,
            actions::open_url,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            island::setup(&handle);
            notifications::start(handle.clone());
            claude_code::start(handle.clone());
            media::start(handle.clone());
            system::start(handle.clone());
            desk::start(handle.clone());
            // The tray: the only way out while the island has no menu of its own.
            let quit = MenuItem::with_id(app, "quit", "Sair do Manga", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            let mut tray = TrayIconBuilder::new().menu(&menu).tooltip("Manga").on_menu_event(|app, event| {
                if event.id.as_ref() == "quit" {
                    app.exit(0);
                }
            });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Manga could not start");
}
