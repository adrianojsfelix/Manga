// Manga: an island at the top of Windows.

mod island;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![island::island_layout, island::island_focus])
        .setup(|app| {
            let handle = app.handle().clone();
            island::setup(&handle);
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
