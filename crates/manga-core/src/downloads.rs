//! Downloads on the island: what the browsers are writing in the Downloads
//! folder (Chrome and Edge ".crdownload", Firefox ".part"), seen from a scan
//! of the folder every moment; and the name of a file Manga downloads itself.

use serde::Serialize;
use std::collections::HashMap;

/// A file in the folder: its name and size.
#[derive(Clone, Debug, PartialEq)]
pub struct Entry {
    pub name: String,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Download {
    /// Stable while it downloads (the partial file's name at first sight).
    pub id: String,
    /// The file's name, as it will be.
    pub name: String,
    pub bytes: u64,
    /// 0 when unknown (a browser does not tell other apps).
    pub total: u64,
    /// Bytes a second.
    pub speed: u64,
    /// "downloading" | "done" | "cancelled".
    pub state: &'static str,
    /// The finished file's name in the folder.
    pub file: String,
}

const PARTIAL: [&str; 3] = [".crdownload", ".part", ".download"];

pub fn is_partial(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    PARTIAL.iter().any(|p| n.ends_with(p))
}

/// "video.mp4.crdownload" → "video.mp4"; Chrome's "Unconfirmed 123.crdownload" stays unnamed.
pub fn final_name(partial: &str) -> String {
    let lower = partial.to_ascii_lowercase();
    for p in PARTIAL {
        if lower.ends_with(p) {
            let base = &partial[..partial.len() - p.len()];
            // Firefox: "file.zip.XXXX.part" keeps a random part before .part.
            if p == ".part" {
                if let Some((stem, rnd)) = base.rsplit_once('.') {
                    if rnd.len() == 6 && rnd.chars().all(|c| c.is_ascii_alphanumeric()) && stem.contains('.') {
                        return stem.to_string();
                    }
                }
            }
            return base.to_string();
        }
    }
    partial.to_string()
}

fn unnamed(name: &str) -> bool {
    let l = name.to_ascii_lowercase();
    l.starts_with("unconfirmed ") || l.starts_with("não confirmado ") || l.starts_with("nao confirmado ")
}

struct Tracked {
    id: String,
    bytes: u64,
    at: u64,
    speed: u64,
}

/// Follows the partial files from one scan to the next.
#[derive(Default)]
pub struct Tracker {
    /// By the partial file's current name.
    live: HashMap<String, Tracked>,
    known: Option<Vec<String>>,
}

impl Tracker {
    /// A new scan (at `now` ms): what changed.
    pub fn scan(&mut self, entries: &[Entry], now: u64) -> Vec<Download> {
        let names: Vec<String> = entries.iter().map(|e| e.name.clone()).collect();
        let Some(known) = self.known.replace(names.clone()) else {
            // The first look: partial files already there are followed, nothing else is news.
            for e in entries.iter().filter(|e| is_partial(&e.name)) {
                self.live.insert(e.name.clone(), Tracked { id: e.name.clone(), bytes: e.size, at: now, speed: 0 });
            }
            return vec![];
        };
        let mut out = Vec::new();
        let fresh: Vec<&Entry> = entries.iter().filter(|e| !known.contains(&e.name)).collect();

        // Partial files that went away: renamed (Chrome: "Unconfirmed" → its name), finished, or cancelled.
        let gone: Vec<String> = self.live.keys().filter(|n| !names.contains(n)).cloned().collect();
        for old in gone {
            let t = self.live.remove(&old).unwrap();
            // Renamed to another partial file: the same download.
            if let Some(e) = fresh.iter().find(|e| is_partial(&e.name) && !self.live.contains_key(&e.name) && (unnamed(&final_name(&old)) || final_name(&e.name) == final_name(&old))) {
                self.live.insert(e.name.clone(), Tracked { id: t.id, bytes: t.bytes, at: t.at, speed: t.speed });
                continue;
            }
            let want = final_name(&old);
            let done = fresh.iter().find(|e| !is_partial(&e.name) && (e.name == want || unnamed(&want)));
            out.push(match done {
                Some(e) => Download { id: t.id, name: e.name.clone(), bytes: e.size, total: e.size, speed: 0, state: "done", file: e.name.clone() },
                None => Download { id: t.id, name: want, bytes: t.bytes, total: 0, speed: 0, state: "cancelled", file: String::new() },
            });
        }

        for e in entries.iter().filter(|e| is_partial(&e.name)) {
            let t = self.live.entry(e.name.clone()).or_insert_with(|| Tracked { id: e.name.clone(), bytes: 0, at: now, speed: 0 });
            let dt = now.saturating_sub(t.at);
            if e.size != t.bytes || dt >= 1000 {
                if dt > 0 {
                    let instant = e.size.saturating_sub(t.bytes) * 1000 / dt;
                    t.speed = if t.speed == 0 { instant } else { (t.speed + instant) / 2 };
                }
                t.bytes = e.size;
                t.at = now;
            }
            out.push(Download { id: t.id.clone(), name: final_name(&e.name), bytes: e.size, total: 0, speed: t.speed, state: "downloading", file: String::new() });
        }
        out
    }
}

/// The name for a file Manga downloads: from the server's header, or the
/// link's last part, cleaned for Windows.
pub fn file_name(url: &str, content_disposition: Option<&str>) -> String {
    let from_header = content_disposition.and_then(|h| {
        let lower = h.to_ascii_lowercase();
        if let Some(i) = lower.find("filename*=") {
            let v = h[i + 10..].split(';').next()?.trim();
            let v = v.rsplit("''").next()?;
            return Some(percent_decode(v.trim_matches('"')));
        }
        let i = lower.find("filename=")?;
        Some(h[i + 9..].split(';').next()?.trim().trim_matches('"').to_string())
    });
    let from_url = || {
        let path = url.split(['?', '#']).next().unwrap_or("");
        let after_host = path.splitn(4, '/').nth(3).unwrap_or("");
        percent_decode(after_host.rsplit('/').next().unwrap_or(""))
    };
    let raw = from_header.filter(|s| !s.is_empty()).unwrap_or_else(from_url);
    let clean: String = raw.chars().map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '_' } else { c }).collect();
    let clean = clean.trim().trim_matches('.').to_string();
    if clean.is_empty() { "download".to_string() } else { clean.chars().take(150).collect() }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// "file.zip" taken: "file (1).zip", "file (2).zip"…
pub fn free_name(name: &str, taken: impl Fn(&str) -> bool) -> String {
    if !taken(name) {
        return name.to_string();
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s, format!(".{e}")),
        _ => (name, String::new()),
    };
    (1..1000).map(|i| format!("{stem} ({i}){ext}")).find(|n| !taken(n)).unwrap_or_else(|| name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn e(name: &str, size: u64) -> Entry {
        Entry { name: name.into(), size }
    }

    #[test]
    fn partial_names() {
        assert!(is_partial("a.zip.crdownload"));
        assert!(is_partial("a.zip.PART"));
        assert!(!is_partial("a.zip"));
        assert_eq!(final_name("video.mp4.crdownload"), "video.mp4");
        assert_eq!(final_name("setup.exe.Ab12Cd.part"), "setup.exe");
        assert_eq!(final_name("notes.part"), "notes");
    }

    #[test]
    fn a_chrome_download_from_unconfirmed_to_done() {
        let mut t = Tracker::default();
        assert!(t.scan(&[e("old.pdf", 10)], 0).is_empty(), "what is there at first is not news");
        let d = t.scan(&[e("old.pdf", 10), e("Unconfirmed 4821.crdownload", 1000)], 1000);
        assert_eq!(d.len(), 1);
        assert_eq!(d[0].state, "downloading");
        let id = d[0].id.clone();
        let d = t.scan(&[e("old.pdf", 10), e("movie.mkv.crdownload", 3000)], 2000);
        assert_eq!((d[0].id.as_str(), d[0].name.as_str(), d[0].bytes), (id.as_str(), "movie.mkv", 3000));
        assert!(d[0].speed > 0);
        let d = t.scan(&[e("old.pdf", 10), e("movie.mkv", 5000)], 3000);
        assert_eq!(d.len(), 1);
        assert_eq!((d[0].id.as_str(), d[0].state, d[0].file.as_str(), d[0].total), (id.as_str(), "done", "movie.mkv", 5000));
        assert!(t.scan(&[e("old.pdf", 10), e("movie.mkv", 5000)], 4000).is_empty());
    }

    #[test]
    fn a_cancelled_download() {
        let mut t = Tracker::default();
        t.scan(&[], 0);
        t.scan(&[e("big.iso.crdownload", 50)], 500);
        let d = t.scan(&[], 1000);
        assert_eq!((d[0].state, d[0].name.as_str()), ("cancelled", "big.iso"));
    }

    #[test]
    fn names_for_manga_downloads() {
        assert_eq!(file_name("https://x.com/files/report%20final.pdf?x=1", None), "report final.pdf");
        assert_eq!(file_name("https://x.com/", None), "download");
        assert_eq!(file_name("https://x.com/get", Some("attachment; filename=\"a:b.zip\"")), "a_b.zip");
        assert_eq!(file_name("https://x.com/get", Some("attachment; filename*=UTF-8''caf%C3%A9.txt")), "café.txt");
        let taken = ["a.zip", "a (1).zip"];
        assert_eq!(free_name("a.zip", |n| taken.contains(&n)), "a (2).zip");
        assert_eq!(free_name("b.zip", |n| taken.contains(&n)), "b.zip");
        assert_eq!(free_name("README", |n| n == "README"), "README (1)");
    }
}
