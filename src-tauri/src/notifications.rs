// Other apps' notifications, read (read-only) from the database Windows keeps
// them in: %LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db,
// through the SQLite that ships with Windows (winsqlite3). Each new toast goes
// to the island as a "notification" event; nothing leaves the computer.
// Undocumented by Microsoft: should a Windows update change it, the island
// simply shows no notifications.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

static WATCHING: AtomicBool = AtomicBool::new(true);

#[derive(Serialize, Clone, Debug)]
pub struct Notice {
    pub id: i64,
    pub app: String,
    /// The app's AppUserModelID (for its icon).
    pub aumid: String,
    pub title: String,
    pub body: String,
    /// Unix ms.
    pub at: i64,
}

#[tauri::command]
pub fn notifications_watch(on: bool) {
    WATCHING.store(on, Ordering::Relaxed);
}

pub fn start(app: AppHandle) {
    #[cfg(windows)]
    std::thread::Builder::new()
        .name("manga-notifications".into())
        .spawn(move || imp::watch(app))
        .ok();
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
mod imp {
    use super::{Notice, WATCHING};
    use crate::winsqlite::Db;
    use manga_core::notifications::{app_name, filetime_to_ms, toast_text};
    use std::sync::atomic::Ordering;
    use std::time::Duration;
    use tauri::{AppHandle, Emitter};

    fn open() -> Option<Db> {
        let base = std::env::var("LOCALAPPDATA").ok()?;
        Db::open_read_only(&format!(r"{base}\Microsoft\Windows\Notifications\wpndatabase.db"))
    }

    fn newest(db: &Db) -> Option<i64> {
        db.query("SELECT COALESCE(MAX(Id), 0) FROM Notification", 0, |r| Some(r.int(0)))?.first().copied()
    }

    fn after(db: &Db, last: i64) -> Option<Vec<Notice>> {
        db.query(
            "SELECT n.Id, n.ArrivalTime, n.Payload, h.PrimaryId FROM Notification n \
             JOIN NotificationHandler h ON h.RecordId = n.HandlerId \
             WHERE n.Id > ?1 AND n.Type = 'toast' ORDER BY n.Id LIMIT 20",
            last,
            |r| {
                let (title, body) = toast_text(&r.text(2, 16_384));
                let id = r.int(0);
                if title.is_empty() && body.is_empty() {
                    // Still moves the reading on.
                    return Some(Notice { id, app: String::new(), aumid: String::new(), title, body, at: 0 });
                }
                let aumid = r.text(3, 512);
                Some(Notice { id, app: app_name(&aumid), aumid, title, body, at: filetime_to_ms(r.int(1)) })
            },
        )
    }

    pub fn watch(app: AppHandle) {
        let mut db: Option<Db> = None;
        let mut last: Option<i64> = None;
        loop {
            std::thread::sleep(Duration::from_millis(1500));
            if !WATCHING.load(Ordering::Relaxed) {
                // Off: start again from the newest when it is back on.
                db = None;
                last = None;
                continue;
            }
            if db.is_none() {
                db = open();
            }
            let Some(d) = db.as_ref() else { continue };
            let Some(from) = last else {
                // The ones already there are not news.
                match newest(d) {
                    Some(id) => last = Some(id),
                    None => db = None,
                }
                continue;
            };
            match after(d, from) {
                Some(list) => {
                    for n in list {
                        last = Some(n.id.max(last.unwrap_or(0)));
                        if !n.app.is_empty() {
                            let _ = app.emit("notification", n);
                        }
                    }
                }
                None => db = None, // reopened next time
            }
        }
    }
}
