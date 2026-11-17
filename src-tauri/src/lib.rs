// Manga: an island at the top of Windows.

mod audio;
mod brightness;
mod chat;
mod claude_code;
mod island;
mod media;
mod notifications;
mod pip;
mod radios;
mod secrets;
#[cfg(windows)]
mod winsqlite;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            island::island_layout,
            island::island_focus,
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
            brightness::brightness_get,
            brightness::brightness_set,
            pip::pip_windows,
            pip::pip_open,
            pip::pip_close,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            island::setup(&handle);
            notifications::start(handle.clone());
            claude_code::start(handle.clone());
            media::start(handle.clone());
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
