// The Windows desk on the island: the keyboard layouts (and switching
// them), the apps open and pinned on the taskbar (switch, open, close), the
// clipboard's history (kept in memory only, never saved, and never what
// password managers mark as private), and copying the shelf's files.

use serde::Serialize;

#[derive(Serialize, Clone, PartialEq)]
pub struct Layout {
    /// The HKL, as a number.
    pub id: isize,
    /// "pt-BR".
    pub locale: String,
    /// "PT".
    pub short: String,
    /// "Português (Brasil)".
    pub name: String,
}

#[derive(Serialize, Clone, PartialEq)]
pub struct Keyboard {
    pub layouts: Vec<Layout>,
    /// The id of the one in use (the active window's).
    pub current: isize,
}

#[derive(Serialize, Clone)]
pub struct AppWindow {
    pub id: isize,
    pub title: String,
    pub app: String,
    pub exe: String,
    pub active: bool,
    pub minimized: bool,
}

#[derive(Serialize, Clone)]
pub struct Pinned {
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Clone)]
pub struct Clip {
    pub id: u64,
    /// "text" | "image" | "files".
    pub kind: &'static str,
    pub text: String,
    /// A small picture (data: URL) for images.
    pub thumb: String,
    pub at: u64,
}

#[tauri::command]
pub fn keyboard_get() -> Keyboard {
    imp::keyboard()
}

#[tauri::command]
pub fn keyboard_set(id: isize) -> bool {
    imp::set_layout(id)
}

#[tauri::command]
pub fn apps_open() -> Vec<AppWindow> {
    imp::apps()
}

/// "activate" | "minimize" | "close".
#[tauri::command]
pub fn app_window(id: isize, action: String) -> bool {
    imp::window(id, &action)
}

#[tauri::command]
pub fn apps_pinned() -> Vec<Pinned> {
    let Ok(base) = std::env::var("APPDATA") else { return vec![] };
    let dir = std::path::Path::new(&base).join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar");
    let Ok(rd) = std::fs::read_dir(&dir) else { return vec![] };
    let mut out: Vec<Pinned> = rd
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().to_lowercase().ends_with(".lnk"))
        .map(|e| Pinned { name: manga_core::desk::shortcut_name(&e.file_name().to_string_lossy()), path: e.path().display().to_string() })
        .collect();
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

/// Opens a pinned app (only shortcuts in the taskbar's pinned folder).
#[tauri::command]
pub fn app_launch(path: String) -> bool {
    apps_pinned().iter().any(|p| p.path == path) && crate::system::open_known(&path)
}

#[tauri::command]
pub fn clipboard_history() -> Vec<Clip> {
    imp::history()
}

/// Puts an entry of the history back on the clipboard.
#[tauri::command]
pub fn clipboard_use(id: u64) -> bool {
    imp::use_clip(id)
}

#[tauri::command]
pub fn clipboard_clear() {
    imp::clear();
}

/// Whether the history is kept (off: it is emptied and nothing is read).
#[tauri::command]
pub fn clipboard_watch(on: bool) {
    imp::watch(on);
}

/// Copies files (the shelf's) as Explorer does, to paste anywhere.
#[tauri::command]
pub fn copy_files(paths: Vec<String>) -> bool {
    let existing: Vec<String> = paths.into_iter().filter(|p| std::path::Path::new(p).exists()).collect();
    !existing.is_empty() && imp::copy_files(&existing)
}

pub fn start(app: tauri::AppHandle) {
    imp::start(app);
}

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn keyboard() -> Keyboard {
        Keyboard { layouts: vec![], current: 0 }
    }
    pub fn set_layout(_: isize) -> bool {
        false
    }
    pub fn apps() -> Vec<AppWindow> {
        vec![]
    }
    pub fn window(_: isize, _: &str) -> bool {
        false
    }
    pub fn history() -> Vec<Clip> {
        vec![]
    }
    pub fn use_clip(_: u64) -> bool {
        false
    }
    pub fn clear() {}
    pub fn watch(_: bool) {}
    pub fn copy_files(_: &[String]) -> bool {
        false
    }
    pub fn start(_: tauri::AppHandle) {}
}

#[cfg(windows)]
mod imp {
    use super::*;
    use manga_core::desk::{dib_to_rgba, dropfiles, layout_short, shrink};
    use manga_core::media::{app_label, data_url};
    use manga_core::png::encode_rgba;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::Mutex;
    use std::time::Duration;
    use tauri::{AppHandle, Emitter};
    use windows::core::{w, BOOL};
    use windows::Win32::Foundation::{HANDLE, HGLOBAL, HWND, LPARAM, WPARAM};
    use windows::Win32::Globalization::{GetLocaleInfoEx, LCIDToLocaleName, LOCALE_SLOCALIZEDDISPLAYNAME};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber, IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, GetKeyboardLayout, GetKeyboardLayoutList, HKL, KEYEVENTF_KEYUP, VK_MENU};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindow, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, PostMessageW,
        SetForegroundWindow, ShowWindow, GWL_EXSTYLE, GW_OWNER, SW_MINIMIZE, SW_RESTORE, WM_CLOSE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
    };

    const CF_UNICODETEXT: u32 = 13;
    const CF_DIB: u32 = 8;
    const CF_HDROP: u32 = 15;
    const WM_INPUTLANGCHANGEREQUEST: u32 = 0x0050;

    // ——— keyboard ———

    fn locale_of(hkl: isize) -> (String, String) {
        let lang = (hkl as usize & 0xffff) as u32;
        let mut buf = [0u16; 85];
        let n = unsafe { LCIDToLocaleName(lang, Some(&mut buf), 0) };
        if n <= 1 {
            return (String::new(), format!("{lang:04X}"));
        }
        let locale = String::from_utf16_lossy(&buf[..n as usize - 1]);
        let mut name = [0u16; 128];
        let m = unsafe { GetLocaleInfoEx(windows::core::PCWSTR(buf.as_ptr()), LOCALE_SLOCALIZEDDISPLAYNAME, Some(&mut name)) };
        let display = if m > 1 { String::from_utf16_lossy(&name[..m as usize - 1]) } else { locale.clone() };
        (locale, display)
    }

    fn foreground_thread() -> u32 {
        unsafe { GetWindowThreadProcessId(GetForegroundWindow(), None) }
    }

    pub fn keyboard() -> Keyboard {
        let mut list = [HKL::default(); 32];
        let n = unsafe { GetKeyboardLayoutList(Some(&mut list)) }.max(0) as usize;
        let layouts = list[..n]
            .iter()
            .map(|h| {
                let id = h.0 as isize;
                let (locale, name) = locale_of(id);
                Layout { id, short: layout_short(&locale), locale, name }
            })
            .collect();
        Keyboard { layouts, current: unsafe { GetKeyboardLayout(foreground_thread()) }.0 as isize }
    }

    pub fn set_layout(id: isize) -> bool {
        unsafe {
            let fg = GetForegroundWindow();
            PostMessageW(Some(fg), WM_INPUTLANGCHANGEREQUEST, WPARAM(0), LPARAM(id)).is_ok()
        }
    }

    // ——— taskbar apps ———

    unsafe extern "system" fn each(hwnd: HWND, list: LPARAM) -> BOOL {
        let list = &mut *(list.0 as *mut Vec<HWND>);
        list.push(hwnd);
        true.into()
    }

    /// The windows the taskbar shows: visible, not hidden away, not tool windows, unowned.
    pub fn apps() -> Vec<AppWindow> {
        let mut all: Vec<HWND> = Vec::new();
        let me = std::process::id();
        unsafe {
            let _ = EnumWindows(Some(each), LPARAM(&mut all as *mut _ as isize));
            let fg = GetForegroundWindow();
            all.into_iter()
                .filter_map(|h| {
                    if !IsWindowVisible(h).as_bool() {
                        return None;
                    }
                    let ex = GetWindowLongPtrW(h, GWL_EXSTYLE) as u32;
                    let owned = GetWindow(h, GW_OWNER).map(|o| !o.0.is_null()).unwrap_or(false);
                    if ex & WS_EX_TOOLWINDOW.0 != 0 || (owned && ex & WS_EX_APPWINDOW.0 == 0) {
                        return None;
                    }
                    let mut cloaked = 0u32;
                    let _ = DwmGetWindowAttribute(h, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut _, 4);
                    if cloaked != 0 {
                        return None;
                    }
                    let n = GetWindowTextLengthW(h);
                    if n <= 0 {
                        return None;
                    }
                    let mut buf = vec![0u16; n as usize + 1];
                    let got = GetWindowTextW(h, &mut buf);
                    let mut pid = 0u32;
                    GetWindowThreadProcessId(h, Some(&mut pid));
                    if pid == me {
                        return None;
                    }
                    let exe = crate::audio::exe_of_window(pid);
                    Some(AppWindow {
                        id: h.0 as isize,
                        title: String::from_utf16_lossy(&buf[..got as usize]),
                        app: app_label(&exe),
                        exe,
                        active: h == fg,
                        minimized: IsIconic(h).as_bool(),
                    })
                })
                .filter(|a| a.title != "Program Manager")
                .collect()
        }
    }

    pub fn window(id: isize, action: &str) -> bool {
        let h = HWND(id as _);
        unsafe {
            match action {
                "activate" => {
                    if IsIconic(h).as_bool() {
                        let _ = ShowWindow(h, SW_RESTORE);
                    }
                    // Windows lets a window come forward after a key press: a tap of Alt.
                    keybd_event(VK_MENU.0 as u8, 0, Default::default(), 0);
                    keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);
                    SetForegroundWindow(h).as_bool()
                }
                "minimize" => ShowWindow(h, SW_MINIMIZE).as_bool(),
                "close" => PostMessageW(Some(h), WM_CLOSE, WPARAM(0), LPARAM(0)).is_ok(),
                _ => false,
            }
        }
    }

    // ——— clipboard ———

    struct Entry {
        clip: Clip,
        /// What goes back on the clipboard: the format and its bytes.
        data: (u32, Vec<u8>),
    }

    static HISTORY: Mutex<Vec<Entry>> = Mutex::new(Vec::new());
    static WATCHING: AtomicBool = AtomicBool::new(true);
    static NEXT: AtomicU64 = AtomicU64::new(1);
    /// The sequence number of what Manga itself put back (not news).
    static OURS: AtomicU64 = AtomicU64::new(0);

    fn now_ms() -> u64 {
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
    }

    unsafe fn global_bytes(h: HANDLE) -> Option<Vec<u8>> {
        let g = HGLOBAL(h.0);
        let p = GlobalLock(g) as *const u8;
        if p.is_null() {
            return None;
        }
        let n = GlobalSize(g);
        let v = std::slice::from_raw_parts(p, n).to_vec();
        let _ = GlobalUnlock(g);
        Some(v)
    }

    fn private_now() -> bool {
        unsafe {
            let exclude = RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
            let can = RegisterClipboardFormatW(w!("CanIncludeInClipboardHistory"));
            if IsClipboardFormatAvailable(exclude).is_ok() {
                return true;
            }
            if IsClipboardFormatAvailable(can).is_ok() {
                if let Ok(h) = GetClipboardData(can) {
                    if let Some(b) = global_bytes(h) {
                        return b.len() >= 4 && u32::from_le_bytes([b[0], b[1], b[2], b[3]]) == 0;
                    }
                }
            }
            false
        }
    }

    fn read_clipboard() -> Option<Entry> {
        unsafe {
            OpenClipboard(None).ok()?;
            let result = (|| {
                if private_now() {
                    return None;
                }
                let id = NEXT.fetch_add(1, Ordering::Relaxed);
                if IsClipboardFormatAvailable(CF_UNICODETEXT).is_ok() {
                    let bytes = global_bytes(GetClipboardData(CF_UNICODETEXT).ok()?)?;
                    let units: Vec<u16> = bytes.chunks(2).map(|c| u16::from_le_bytes([c[0], *c.get(1).unwrap_or(&0)])).take_while(|&u| u != 0).collect();
                    let text = String::from_utf16_lossy(&units);
                    if text.trim().is_empty() || text.len() > 200_000 {
                        return None;
                    }
                    return Some(Entry { clip: Clip { id, kind: "text", text: text.chars().take(2000).collect(), thumb: String::new(), at: now_ms() }, data: (CF_UNICODETEXT, bytes) });
                }
                if IsClipboardFormatAvailable(CF_DIB).is_ok() {
                    let bytes = global_bytes(GetClipboardData(CF_DIB).ok()?)?;
                    if bytes.len() > 64 * 1024 * 1024 {
                        return None;
                    }
                    let (w, h, px) = dib_to_rgba(&bytes)?;
                    let (tw, th, small) = shrink(w, h, &px, 160);
                    let thumb = data_url("image/png", &encode_rgba(tw, th, &small));
                    return Some(Entry { clip: Clip { id, kind: "image", text: format!("{w}×{h}"), thumb, at: now_ms() }, data: (CF_DIB, bytes) });
                }
                None
            })();
            let _ = CloseClipboard();
            result
        }
    }

    fn put(format: u32, bytes: &[u8]) -> bool {
        unsafe {
            let Ok(g) = GlobalAlloc(GMEM_MOVEABLE, bytes.len()) else { return false };
            let p = GlobalLock(g) as *mut u8;
            if p.is_null() {
                return false;
            }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), p, bytes.len());
            let _ = GlobalUnlock(g);
            if OpenClipboard(None).is_err() {
                return false;
            }
            let _ = EmptyClipboard();
            let ok = SetClipboardData(format, Some(HANDLE(g.0))).is_ok();
            let _ = CloseClipboard();
            OURS.store(GetClipboardSequenceNumber() as u64, Ordering::Relaxed);
            ok
        }
    }

    pub fn history() -> Vec<Clip> {
        HISTORY.lock().unwrap().iter().rev().map(|e| e.clip.clone()).collect()
    }

    pub fn use_clip(id: u64) -> bool {
        let data = HISTORY.lock().unwrap().iter().find(|e| e.clip.id == id).map(|e| e.data.clone());
        data.is_some_and(|(f, b)| put(f, &b))
    }

    pub fn clear() {
        HISTORY.lock().unwrap().clear();
    }

    pub fn watch(on: bool) {
        WATCHING.store(on, Ordering::Relaxed);
        if !on {
            clear();
        }
    }

    pub fn copy_files(paths: &[String]) -> bool {
        put(CF_HDROP, &dropfiles(paths))
    }

    pub fn start(app: AppHandle) {
        std::thread::spawn(move || {
            let mut last_seq = unsafe { GetClipboardSequenceNumber() };
            let mut last_kb = keyboard();
            loop {
                std::thread::sleep(Duration::from_millis(600));
                let kb = keyboard();
                if kb != last_kb {
                    last_kb = kb.clone();
                    let _ = app.emit("keyboard", kb);
                }
                let seq = unsafe { GetClipboardSequenceNumber() };
                if seq == last_seq {
                    continue;
                }
                last_seq = seq;
                if !WATCHING.load(Ordering::Relaxed) || seq as u64 == OURS.load(Ordering::Relaxed) {
                    continue;
                }
                if let Some(e) = read_clipboard() {
                    let mut h = HISTORY.lock().unwrap();
                    // The same text again moves up instead of repeating.
                    h.retain(|x| !(x.clip.kind == "text" && e.clip.kind == "text" && x.clip.text == e.clip.text));
                    h.push(e);
                    let extra = h.len().saturating_sub(30);
                    h.drain(..extra);
                    drop(h);
                    let _ = app.emit("clipboard", ());
                }
            }
        });
    }
}
