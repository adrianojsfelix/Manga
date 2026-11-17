// Read-only SQLite through winsqlite3.dll, the SQLite that ships with Windows
// 10 and 11, loaded at run time: no SQLite to compile or install. Only what
// reading Windows' notification database needs.

use std::ffi::{c_char, c_int, c_void, CString};
use std::sync::OnceLock;
use windows::core::{s, w};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

const READ_ONLY: c_int = 0x0000_0001;
const NO_MUTEX: c_int = 0x0000_8000;
const ROW: c_int = 100;

type Open = unsafe extern "system" fn(*const c_char, *mut *mut c_void, c_int, *const c_char) -> c_int;
type Close = unsafe extern "system" fn(*mut c_void) -> c_int;
type Busy = unsafe extern "system" fn(*mut c_void, c_int) -> c_int;
type Prepare = unsafe extern "system" fn(*mut c_void, *const c_char, c_int, *mut *mut c_void, *mut *const c_char) -> c_int;
type BindI64 = unsafe extern "system" fn(*mut c_void, c_int, i64) -> c_int;
type Step = unsafe extern "system" fn(*mut c_void) -> c_int;
type ColI64 = unsafe extern "system" fn(*mut c_void, c_int) -> i64;
type ColBlob = unsafe extern "system" fn(*mut c_void, c_int) -> *const c_void;
type ColBytes = unsafe extern "system" fn(*mut c_void, c_int) -> c_int;
type Finalize = unsafe extern "system" fn(*mut c_void) -> c_int;

struct Api {
    open: Open,
    close: Close,
    busy: Busy,
    prepare: Prepare,
    bind_i64: BindI64,
    step: Step,
    col_i64: ColI64,
    col_blob: ColBlob,
    col_bytes: ColBytes,
    finalize: Finalize,
}

fn api() -> Option<&'static Api> {
    static API: OnceLock<Option<Api>> = OnceLock::new();
    API.get_or_init(|| unsafe {
        let lib = LoadLibraryW(w!("winsqlite3.dll")).ok()?;
        macro_rules! f {
            ($name:expr) => {
                std::mem::transmute(GetProcAddress(lib, $name)?)
            };
        }
        Some(Api {
            open: f!(s!("sqlite3_open_v2")),
            close: f!(s!("sqlite3_close")),
            busy: f!(s!("sqlite3_busy_timeout")),
            prepare: f!(s!("sqlite3_prepare_v2")),
            bind_i64: f!(s!("sqlite3_bind_int64")),
            step: f!(s!("sqlite3_step")),
            col_i64: f!(s!("sqlite3_column_int64")),
            col_blob: f!(s!("sqlite3_column_blob")),
            col_bytes: f!(s!("sqlite3_column_bytes")),
            finalize: f!(s!("sqlite3_finalize")),
        })
    })
    .as_ref()
}

/// A database opened read-only.
pub struct Db {
    api: &'static Api,
    handle: *mut c_void,
}

// Used from one thread at a time (the notification reader's).
unsafe impl Send for Db {}

impl Db {
    pub fn open_read_only(path: &str) -> Option<Db> {
        let api = api()?;
        let path = CString::new(path).ok()?;
        let mut handle = std::ptr::null_mut();
        let rc = unsafe { (api.open)(path.as_ptr(), &mut handle, READ_ONLY | NO_MUTEX, std::ptr::null()) };
        if rc != 0 {
            if !handle.is_null() {
                unsafe { (api.close)(handle) };
            }
            return None;
        }
        unsafe { (api.busy)(handle, 250) };
        Some(Db { api, handle })
    }

    /// Runs `sql` with one integer parameter (?1); `row` reads each row.
    pub fn query<T>(&self, sql: &str, param: i64, mut row: impl FnMut(&Row) -> Option<T>) -> Option<Vec<T>> {
        let sql = CString::new(sql).ok()?;
        let mut stmt = std::ptr::null_mut();
        let rc = unsafe { (self.api.prepare)(self.handle, sql.as_ptr(), -1, &mut stmt, std::ptr::null_mut()) };
        if rc != 0 || stmt.is_null() {
            return None;
        }
        let mut out = Vec::new();
        unsafe {
            if sql.as_bytes().contains(&b'?') {
                (self.api.bind_i64)(stmt, 1, param);
            }
            loop {
                let rc = (self.api.step)(stmt);
                if rc != ROW {
                    // DONE, or an error (the database busy, changed): what was read stays.
                    let ok = rc == 101;
                    (self.api.finalize)(stmt);
                    return if ok || !out.is_empty() { Some(out) } else { None };
                }
                if let Some(v) = row(&Row { api: self.api, stmt }) {
                    out.push(v);
                }
            }
        }
    }
}

impl Drop for Db {
    fn drop(&mut self) {
        unsafe { (self.api.close)(self.handle) };
    }
}

pub struct Row {
    api: &'static Api,
    stmt: *mut c_void,
}

impl Row {
    pub fn int(&self, col: i32) -> i64 {
        unsafe { (self.api.col_i64)(self.stmt, col) }
    }

    /// A text or blob column, as text (at most `max` bytes).
    pub fn text(&self, col: i32, max: usize) -> String {
        unsafe {
            let p = (self.api.col_blob)(self.stmt, col) as *const u8;
            let n = (self.api.col_bytes)(self.stmt, col).max(0) as usize;
            if p.is_null() || n == 0 {
                return String::new();
            }
            String::from_utf8_lossy(std::slice::from_raw_parts(p, n.min(max))).into_owned()
        }
    }
}
