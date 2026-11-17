// What happens on the PC that the island tells: Caps / Num / Scroll Lock,
// a new screenshot, downloads (the browsers' and Manga's own), and each
// app's icon for its notifications. Opening a file or its folder.

use manga_core::downloads::{file_name, free_name, Download, Entry, Tracker};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, Copy, PartialEq, Default)]
pub struct Locks {
    pub caps: bool,
    pub num: bool,
    pub scroll: bool,
}

#[derive(Serialize, Clone)]
pub struct Shot {
    pub path: String,
    pub name: String,
    /// A data: URL (empty when too big).
    pub image: String,
}

#[tauri::command]
pub fn locks_get() -> Locks {
    imp::locks()
}

/// Opens a file (reveal: its folder, with it selected).
#[tauri::command]
pub fn open_path(path: String, reveal: bool) -> bool {
    imp::open(&path, reveal)
}

#[tauri::command]
pub fn downloads_folder() -> String {
    imp::known(true).map(|p| p.display().to_string()).unwrap_or_default()
}

/// An app's icon (by its AppUserModelID), as a data: URL.
#[tauri::command]
pub async fn app_icon(aumid: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || imp::icon(&aumid)).await.ok().flatten()
}

static NEXT: AtomicU64 = AtomicU64::new(1);

/// Downloads a link to the Downloads folder, telling its progress as "download".
#[tauri::command]
pub async fn download_url(app: AppHandle, url: String) -> Result<String, String> {
    let url = url.trim().to_string();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Cole um link que comece com http:// ou https://.".into());
    }
    let dir = imp::known(true).ok_or("Não achei a pasta Downloads.")?;
    let client = reqwest::Client::builder().build().map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| format!("Não consegui baixar: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("O site respondeu {}.", resp.status().as_u16()));
    }
    let cd = resp.headers().get("content-disposition").and_then(|v| v.to_str().ok()).map(str::to_string);
    let name = free_name(&file_name(&url, cd.as_deref()), |n| dir.join(n).exists());
    let id = format!("manga:{}", NEXT.fetch_add(1, Ordering::Relaxed));
    let total = resp.content_length().unwrap_or(0);
    let tmp = dir.join(format!("{name}.manga-download"));
    let done_path = dir.join(&name);
    let app2 = app.clone();
    let id2 = id.clone();
    tauri::async_runtime::spawn(async move {
        let result = save(&app2, &id2, &name, total, resp, &tmp).await;
        let last = match result {
            Ok(bytes) if std::fs::rename(&tmp, &done_path).is_ok() => {
                Download { id: id2, name: name.clone(), bytes, total: bytes, speed: 0, state: "done", file: name }
            }
            _ => {
                let _ = std::fs::remove_file(&tmp);
                Download { id: id2, name, bytes: 0, total, speed: 0, state: "cancelled", file: String::new() }
            }
        };
        let _ = app2.emit("download", vec![last]);
    });
    Ok(id)
}

async fn save(app: &AppHandle, id: &str, name: &str, total: u64, resp: reqwest::Response, tmp: &Path) -> Result<u64, String> {
    use futures_util::StreamExt;
    use std::io::Write;
    let mut file = std::fs::File::create(tmp).map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();
    let (mut bytes, mut told, mut window) = (0u64, Instant::now(), (Instant::now(), 0u64));
    let mut speed = 0u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        bytes += chunk.len() as u64;
        if told.elapsed() > Duration::from_millis(250) {
            let dt = window.0.elapsed().as_millis().max(1) as u64;
            speed = (bytes - window.1) * 1000 / dt;
            window = (Instant::now(), bytes);
            told = Instant::now();
            let d = Download { id: id.into(), name: name.into(), bytes, total, speed, state: "downloading", file: String::new() };
            let _ = app.emit("download", vec![d]);
        }
    }
    let _ = speed;
    file.flush().map_err(|e| e.to_string())?;
    Ok(bytes)
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn scan(dir: &Path) -> Vec<(Entry, SystemTime)> {
    let Ok(rd) = std::fs::read_dir(dir) else { return vec![] };
    rd.flatten()
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            if !m.is_file() {
                return None;
            }
            let name = e.file_name().to_string_lossy().into_owned();
            if name.ends_with(".manga-download") {
                return None;
            }
            Some((Entry { name, size: m.len() }, m.modified().unwrap_or(UNIX_EPOCH)))
        })
        .collect()
}

pub fn start(app: AppHandle) {
    // The lock keys.
    let a = app.clone();
    std::thread::spawn(move || {
        let mut last = imp::locks();
        loop {
            std::thread::sleep(Duration::from_millis(120));
            let now = imp::locks();
            if now != last {
                last = now;
                let _ = a.emit("locks", now);
            }
        }
    });

    // The Screenshots and Downloads folders.
    std::thread::spawn(move || {
        let shots: Option<PathBuf> = imp::known(false);
        let downloads: Option<PathBuf> = imp::known(true);
        let started = SystemTime::now();
        let mut seen_shots: Vec<String> = shots.as_deref().map(scan).unwrap_or_default().into_iter().map(|(e, _)| e.name).collect();
        let mut tracker = Tracker::default();
        let mut pending_shot: Option<(PathBuf, u64)> = None;
        loop {
            if let Some(dir) = downloads.as_deref() {
                let entries: Vec<Entry> = scan(dir).into_iter().map(|(e, _)| e).collect();
                let news = tracker.scan(&entries, now_ms());
                if !news.is_empty() {
                    let _ = app.emit("download", news);
                }
            }
            if let Some(dir) = shots.as_deref() {
                // A new picture, once its size stops changing.
                if let Some((path, size)) = pending_shot.take() {
                    let now = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    if now == size && now > 0 {
                        let _ = app.emit("screenshot", shot(&path));
                    } else if now > 0 {
                        pending_shot = Some((path, now));
                    }
                }
                for (e, modified) in scan(dir) {
                    if seen_shots.contains(&e.name) {
                        continue;
                    }
                    seen_shots.push(e.name.clone());
                    let lower = e.name.to_ascii_lowercase();
                    if modified >= started && (lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".jpeg")) {
                        pending_shot = Some((dir.join(&e.name), e.size));
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(700));
        }
    });
}

fn shot(path: &Path) -> Shot {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let image = std::fs::read(path)
        .ok()
        .filter(|b| b.len() < 12 * 1024 * 1024)
        .map(|b| manga_core::media::data_url(if name.to_ascii_lowercase().ends_with(".png") { "image/png" } else { "image/jpeg" }, &b))
        .unwrap_or_default();
    Shot { path: path.display().to_string(), name, image }
}

#[cfg(not(windows))]
mod imp {
    use std::path::PathBuf;
    pub fn locks() -> super::Locks {
        super::Locks::default()
    }
    pub fn open(_: &str, _: bool) -> bool {
        false
    }
    pub fn known(downloads: bool) -> Option<PathBuf> {
        let home = std::env::var("HOME").ok()?;
        Some(PathBuf::from(home).join(if downloads { "Downloads" } else { "Pictures/Screenshots" }))
    }
    pub fn icon(_: &str) -> Option<String> {
        None
    }
}

#[cfg(windows)]
mod imp {
    use super::Locks;
    use manga_core::png::{bgra_to_rgba, encode_rgba};
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{DeleteObject, GetDC, GetDIBits, ReleaseDC, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ};
    use windows::Win32::System::Com::{CoInitializeEx, CoTaskMemFree, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CAPITAL, VK_NUMLOCK, VK_SCROLL};
    use windows::Win32::UI::Shell::{
        FOLDERID_Downloads, FOLDERID_Screenshots, IShellItemImageFactory, SHCreateItemFromParsingName, SHGetKnownFolderPath, ShellExecuteW, KF_FLAG_DEFAULT,
        SIIGBF_ICONONLY,
    };
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    pub fn locks() -> Locks {
        let on = |k: u16| unsafe { GetKeyState(k as i32) & 1 != 0 };
        Locks { caps: on(VK_CAPITAL.0), num: on(VK_NUMLOCK.0), scroll: on(VK_SCROLL.0) }
    }

    pub fn known(downloads: bool) -> Option<PathBuf> {
        unsafe {
            let id = if downloads { &FOLDERID_Downloads } else { &FOLDERID_Screenshots };
            let p = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
            let s = p.to_string().ok();
            CoTaskMemFree(Some(p.0 as *const _));
            s.map(PathBuf::from)
        }
    }

    pub fn open(path: &str, reveal: bool) -> bool {
        if reveal {
            return std::process::Command::new("explorer").arg(format!("/select,{path}")).spawn().is_ok();
        }
        unsafe {
            let r = ShellExecuteW(None, &HSTRING::from("open"), &HSTRING::from(path), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
            r.0 as isize > 32
        }
    }

    static ICONS: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);

    pub fn icon(aumid: &str) -> Option<String> {
        if aumid.is_empty() {
            return None;
        }
        if let Some(hit) = ICONS.lock().unwrap().get_or_insert_with(HashMap::new).get(aumid) {
            return hit.clone();
        }
        let made = make_icon(aumid);
        ICONS.lock().unwrap().get_or_insert_with(HashMap::new).insert(aumid.to_string(), made.clone());
        made
    }

    fn make_icon(aumid: &str) -> Option<String> {
        const N: i32 = 48;
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let item: IShellItemImageFactory = SHCreateItemFromParsingName(&HSTRING::from(format!("shell:AppsFolder\\{aumid}")), None).ok()?;
            let bmp = item.GetImage(SIZE { cx: N, cy: N }, SIIGBF_ICONONLY).ok()?;
            let mut info = BITMAPINFO::default();
            info.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: N,
                biHeight: -N, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            };
            let mut px = vec![0u8; (N * N * 4) as usize];
            let dc = GetDC(None);
            let rows = GetDIBits(dc, bmp, 0, N as u32, Some(px.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);
            ReleaseDC(None, dc);
            let _ = DeleteObject(HGDIOBJ(bmp.0));
            if rows == 0 || px.iter().skip(3).step_by(4).all(|&a| a == 0) {
                return None;
            }
            let rgba = bgra_to_rgba(N as u32, N as u32, &px, false);
            Some(manga_core::media::data_url("image/png", &encode_rgba(N as u32, N as u32, &rgba)))
        }
    }
}
