// What plays, in any app: Windows' media sessions (the same the volume
// flyout shows). A thread reads the current one and tells the island when
// it changes; the island's buttons control it.

use serde::Serialize;

#[derive(Serialize, Clone, PartialEq, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    pub app: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub playing: bool,
    /// Seconds; 0 when the app does not say.
    pub position: f64,
    pub duration: f64,
    /// A data: URL, or empty.
    pub cover: String,
    pub can_seek: bool,
    pub can_skip: bool,
    /// "none" | "track" | "list".
    pub repeat: String,
    pub can_repeat: bool,
}

#[tauri::command]
pub fn media_control(action: String, position: Option<f64>) -> bool {
    imp::control(&action, position)
}

pub fn start(app: tauri::AppHandle) {
    imp::start(app);
}

/// What plays now (for PiP): the app and the title.
pub fn now() -> Option<Media> {
    imp::now()
}

#[cfg(not(windows))]
mod imp {
    pub fn control(_: &str, _: Option<f64>) -> bool {
        false
    }
    pub fn start(_: tauri::AppHandle) {}
    pub fn now() -> Option<super::Media> {
        None
    }
}

#[cfg(windows)]
mod imp {
    use super::Media;
    use manga_core::media::data_url;
    use manga_core::notifications::app_name;
    use std::sync::Mutex;
    use std::time::Duration;
    use tauri::{AppHandle, Emitter};
    use windows::core::Result;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session, GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    use windows::Media::MediaPlaybackAutoRepeatMode as Repeat;
    use windows::Storage::Streams::{DataReader, IRandomAccessStreamReference};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    static LAST: Mutex<Option<Media>> = Mutex::new(None);

    fn manager() -> Result<Manager> {
        Manager::RequestAsync()?.get()
    }

    fn cover(r: &IRandomAccessStreamReference) -> Result<String> {
        let stream = r.OpenReadAsync()?.get()?;
        let size = stream.Size()? as u32;
        if size == 0 || size > 4 * 1024 * 1024 {
            return Ok(String::new());
        }
        let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0)?)?;
        reader.LoadAsync(size)?.get()?;
        let mut buf = vec![0u8; size as usize];
        reader.ReadBytes(&mut buf)?;
        Ok(data_url(&stream.ContentType()?.to_string(), &buf))
    }

    fn read(s: &Session, prev: Option<&Media>) -> Result<Media> {
        let props = s.TryGetMediaPropertiesAsync()?.get()?;
        let info = s.GetPlaybackInfo()?;
        let controls = info.Controls()?;
        let timeline = s.GetTimelineProperties()?;
        let ticks = |t: windows::Foundation::TimeSpan| t.Duration as f64 / 10_000_000.0;
        let mut m = Media {
            app: app_name(&s.SourceAppUserModelId()?.to_string()),
            title: props.Title()?.to_string(),
            artist: props.Artist()?.to_string(),
            album: props.AlbumTitle()?.to_string(),
            playing: info.PlaybackStatus()? == Status::Playing,
            position: ticks(timeline.Position()?),
            duration: (ticks(timeline.EndTime()?) - ticks(timeline.StartTime()?)).max(0.0),
            cover: String::new(),
            can_seek: controls.IsPlaybackPositionEnabled().unwrap_or(false),
            can_skip: controls.IsNextEnabled().unwrap_or(false) || controls.IsPreviousEnabled().unwrap_or(false),
            repeat: match info.AutoRepeatMode().and_then(|r| r.Value()) {
                Ok(m) if m == Repeat::Track => "track",
                Ok(m) if m == Repeat::List => "list",
                _ => "none",
            }
            .to_string(),
            can_repeat: controls.IsRepeatEnabled().unwrap_or(false),
        };
        // The cover is read again only for another song.
        match prev {
            Some(p) if p.title == m.title && p.artist == m.artist && !p.cover.is_empty() => m.cover = p.cover.clone(),
            _ => {
                if let Ok(t) = props.Thumbnail() {
                    m.cover = cover(&t).unwrap_or_default();
                }
            }
        }
        Ok(m)
    }

    pub fn now() -> Option<Media> {
        LAST.lock().unwrap().clone()
    }

    pub fn start(app: AppHandle) {
        std::thread::spawn(move || {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }
            let mut mgr: Option<Manager> = None;
            let mut sent: Option<Media> = None;
            let mut since_sent = 0u32;
            loop {
                std::thread::sleep(Duration::from_millis(700));
                if mgr.is_none() {
                    mgr = manager().ok();
                }
                let Some(m) = mgr.as_ref() else { continue };
                let now = m.GetCurrentSession().ok().and_then(|s| read(&s, sent.as_ref()).ok()).filter(|x| !x.title.is_empty());
                // Position moves every read: it is sent on changes and every few seconds.
                since_sent += 1;
                let changed = match (&now, &sent) {
                    (Some(a), Some(b)) => a.title != b.title || a.playing != b.playing || a.repeat != b.repeat || a.artist != b.artist || a.cover != b.cover || (a.position - b.position).abs() > 3.0 || since_sent >= 5,
                    (None, None) => false,
                    _ => true,
                };
                if changed {
                    since_sent = 0;
                    *LAST.lock().unwrap() = now.clone();
                    let _ = app.emit("media", now.clone());
                    sent = now;
                }
            }
        });
    }

    pub fn control(action: &str, position: Option<f64>) -> bool {
        let run = || -> Result<bool> {
            let s = manager()?.GetCurrentSession()?;
            Ok(match action {
                "play_pause" => s.TryTogglePlayPauseAsync()?.get()?,
                "next" => s.TrySkipNextAsync()?.get()?,
                "previous" => s.TrySkipPreviousAsync()?.get()?,
                // Off → the list → this one → off, as the players do.
                "repeat" => {
                    let now = s.GetPlaybackInfo()?.AutoRepeatMode().and_then(|r| r.Value()).unwrap_or(Repeat::None);
                    let next = if now == Repeat::None { Repeat::List } else if now == Repeat::List { Repeat::Track } else { Repeat::None };
                    s.TryChangeAutoRepeatModeAsync(next)?.get()?
                }
                "seek" => {
                    let start = s.GetTimelineProperties()?.StartTime()?.Duration;
                    let at = start + (position.unwrap_or(0.0).max(0.0) * 10_000_000.0) as i64;
                    s.TryChangePlaybackPositionAsync(at)?.get()?
                }
                _ => false,
            })
        };
        run().unwrap_or(false)
    }
}
