//! Media on the island, the parts that need no Windows: the cover's bytes as
//! a data URL, an app's name from its program, and which window shows what
//! plays (for picture-in-picture).

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn base64(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for c in bytes.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if c.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if c.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

pub fn data_url(content_type: &str, bytes: &[u8]) -> String {
    let kind = if content_type.starts_with("image/") { content_type } else { "image/png" };
    format!("data:{kind};base64,{}", base64(bytes))
}

/// A program's name for people: "C:\\…\\msedge.exe" → "Edge".
pub fn app_label(exe: &str) -> String {
    let file = exe.rsplit(['\\', '/']).next().unwrap_or(exe);
    let stem = file.strip_suffix(".exe").or_else(|| file.strip_suffix(".EXE")).unwrap_or(file);
    let known = match stem.to_ascii_lowercase().as_str() {
        "msedge" => Some("Edge"),
        "chrome" => Some("Chrome"),
        "firefox" => Some("Firefox"),
        "brave" => Some("Brave"),
        "opera" | "opera_gx" => Some("Opera"),
        "spotify" => Some("Spotify"),
        "vlc" => Some("VLC"),
        "discord" => Some("Discord"),
        "teams" | "ms-teams" => Some("Teams"),
        "applemusic" => Some("Apple Music"),
        "zunemusic" | "microsoft.media.player" => Some("Media Player"),
        _ => None,
    };
    if let Some(k) = known {
        return k.to_string();
    }
    let mut c = stem.chars();
    match c.next() {
        Some(f) => f.to_uppercase().chain(c).collect(),
        None => String::new(),
    }
}

/// A window on screen, as picture-in-picture weighs it.
pub struct Candidate<'a> {
    pub title: &'a str,
    /// The program's file name ("chrome.exe").
    pub exe: &'a str,
}

fn norm(s: &str) -> String {
    s.to_lowercase().chars().filter(|c| c.is_alphanumeric() || c.is_whitespace()).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ")
}

/// How well a window matches what plays (0: not at all). The app comes from
/// the media session ("Chrome", "Spotify.exe", an AUMID), the title from the media.
pub fn window_score(w: &Candidate, app: &str, media_title: &str) -> u32 {
    if w.title.trim().is_empty() {
        return 0;
    }
    let exe = w.exe.to_lowercase();
    let exe_stem = exe.trim_end_matches(".exe");
    let app = app.to_lowercase();
    let same_app = !exe_stem.is_empty() && (app.contains(exe_stem) || (exe_stem == "msedge" && app.contains("edge")));
    let title = norm(w.title);
    let media = norm(media_title);
    let has_title = media.len() >= 3 && title.contains(&media);
    match (same_app, has_title) {
        (true, true) => 100,
        (false, true) => 60,
        (true, false) => 30,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_as_everyone_writes_it() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
        assert_eq!(base64(&[255, 254, 253]), "//79");
        assert_eq!(data_url("image/jpeg", b"foo"), "data:image/jpeg;base64,Zm9v");
        assert_eq!(data_url("", b"foo"), "data:image/png;base64,Zm9v");
    }

    #[test]
    fn programs_read_as_their_names() {
        assert_eq!(app_label(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"), "Edge");
        assert_eq!(app_label("Spotify.exe"), "Spotify");
        assert_eq!(app_label("/usr/bin/obs64.exe"), "Obs64");
        assert_eq!(app_label(""), "");
    }

    #[test]
    fn the_window_showing_what_plays_wins() {
        let yt = Candidate { title: "Lofi Girl - beats to relax/study to - YouTube - Google Chrome", exe: "chrome.exe" };
        let other_tab = Candidate { title: "Gmail - Google Chrome", exe: "chrome.exe" };
        let notes = Candidate { title: "lofi girl beats to relax", exe: "notepad.exe" };
        let untitled = Candidate { title: "", exe: "chrome.exe" };
        let title = "Lofi Girl - beats to relax/study to";
        assert_eq!(window_score(&yt, "Chrome", title), 100);
        assert_eq!(window_score(&other_tab, "Chrome", title), 30);
        assert_eq!(window_score(&notes, "Chrome", title), 0, "the title punctuation differs: no match");
        assert_eq!(window_score(&untitled, "Chrome", title), 0);
        let edge = Candidate { title: "Song - YouTube - Microsoft Edge", exe: "msedge.exe" };
        assert_eq!(window_score(&edge, "MSEdge", "Song"), 100);
        assert_eq!(window_score(&edge, "Microsoft Edge", "Song"), 100);
    }
}
