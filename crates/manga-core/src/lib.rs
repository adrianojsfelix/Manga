//! Manga's logic that needs neither Windows nor a window, so it is tested on
//! any computer (`cargo test -p manga-core`). The app (src-tauri) calls it.

pub mod chat;
pub mod geometry;
pub mod notifications;
pub mod sse;
pub mod hooks;
pub mod http;
pub mod media;
pub mod downloads;
pub mod png;
pub mod sysinfo;
