// The sound: the speakers' volume and mute, each app's volume, the
// microphone's mute, and how loud it plays now (the island's sound waves).
// Windows' Core Audio, read on demand.

use serde::Serialize;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppVolume {
    pub pid: u32,
    pub name: String,
    pub volume: f32,
    pub muted: bool,
    /// Making sound now.
    pub active: bool,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Sound {
    /// 0–1, or -1 when there is no output device.
    pub volume: f32,
    pub muted: bool,
    /// The microphone: None without one.
    pub mic_muted: Option<bool>,
    pub apps: Vec<AppVolume>,
}

#[tauri::command]
pub fn sound_get() -> Sound {
    imp::get().unwrap_or(Sound { volume: -1.0, ..Default::default() })
}

/// what: "volume" | "mute" | "mic_mute" | "app_volume" | "app_mute".
#[tauri::command]
pub fn sound_set(what: String, value: f32, pid: Option<u32>) -> bool {
    imp::set(&what, value, pid).is_ok()
}

/// How loud the speakers play now, 0–1 (the waves).
#[tauri::command]
pub fn sound_level() -> f32 {
    imp::level().unwrap_or(0.0)
}

/// A window's program, by its process (PiP uses it).
#[cfg(windows)]
pub fn exe_of_window(pid: u32) -> String {
    imp::exe_of(pid)
}

#[cfg(not(windows))]
mod imp {
    pub fn get() -> Option<super::Sound> {
        None
    }
    pub fn set(_: &str, _: f32, _: Option<u32>) -> Result<(), ()> {
        Err(())
    }
    pub fn level() -> Option<f32> {
        None
    }
}

#[cfg(windows)]
mod imp {
    use super::{AppVolume, Sound};
    use manga_core::media::app_label;
    use windows::core::{Interface, Result, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, S_OK};
    use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation};
    use windows::Win32::Media::Audio::{
        eCapture, eCommunications, eConsole, eRender, AudioSessionStateActive, IAudioSessionControl2, IAudioSessionManager2, IMMDevice, IMMDeviceEnumerator,
        ISimpleAudioVolume, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};

    fn device(capture: bool) -> Result<IMMDevice> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let e: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            if capture {
                e.GetDefaultAudioEndpoint(eCapture, eCommunications)
            } else {
                e.GetDefaultAudioEndpoint(eRender, eConsole)
            }
        }
    }

    fn endpoint(capture: bool) -> Result<IAudioEndpointVolume> {
        unsafe { device(capture)?.Activate(CLSCTX_ALL, None) }
    }

    pub fn exe_of(pid: u32) -> String {
        unsafe {
            let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return String::new() };
            let mut buf = [0u16; 520];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(h);
            if ok {
                String::from_utf16_lossy(&buf[..len as usize])
            } else {
                String::new()
            }
        }
    }

    fn sessions() -> Result<Vec<(u32, ISimpleAudioVolume, bool)>> {
        unsafe {
            let mgr: IAudioSessionManager2 = device(false)?.Activate(CLSCTX_ALL, None)?;
            let list = mgr.GetSessionEnumerator()?;
            let mut out = Vec::new();
            for i in 0..list.GetCount()? {
                let ctl = list.GetSession(i)?;
                let ctl2: IAudioSessionControl2 = ctl.cast()?;
                if ctl2.IsSystemSoundsSession() == S_OK {
                    continue;
                }
                let pid = ctl2.GetProcessId().unwrap_or(0);
                if pid == 0 {
                    continue;
                }
                let active = ctl.GetState().map(|s| s == AudioSessionStateActive).unwrap_or(false);
                out.push((pid, ctl.cast::<ISimpleAudioVolume>()?, active));
            }
            Ok(out)
        }
    }

    pub fn get() -> Option<Sound> {
        let out = endpoint(false).ok()?;
        let mut s = Sound::default();
        unsafe {
            s.volume = out.GetMasterVolumeLevelScalar().unwrap_or(0.0);
            s.muted = out.GetMute().map(|b| b.as_bool()).unwrap_or(false);
            s.mic_muted = endpoint(true).ok().and_then(|m| m.GetMute().ok()).map(|b| b.as_bool());
            for (pid, v, active) in sessions().unwrap_or_default() {
                // One line per app (a browser has many sessions).
                let name = app_label(&exe_of(pid));
                if name.is_empty() {
                    continue;
                }
                let volume = v.GetMasterVolume().unwrap_or(1.0);
                let muted = v.GetMute().map(|b| b.as_bool()).unwrap_or(false);
                if let Some(a) = s.apps.iter_mut().find(|a| a.name == name) {
                    a.active |= active;
                    continue;
                }
                s.apps.push(AppVolume { pid, name, volume, muted, active });
            }
        }
        s.apps.sort_by(|a, b| b.active.cmp(&a.active).then(a.name.cmp(&b.name)));
        Some(s)
    }

    pub fn set(what: &str, value: f32, pid: Option<u32>) -> Result<()> {
        let v = value.clamp(0.0, 1.0);
        let on = value > 0.5;
        unsafe {
            match what {
                "volume" => endpoint(false)?.SetMasterVolumeLevelScalar(v, std::ptr::null()),
                "mute" => endpoint(false)?.SetMute(on, std::ptr::null()),
                "mic_mute" => endpoint(true)?.SetMute(on, std::ptr::null()),
                "app_volume" | "app_mute" => {
                    // Every session of that app (by its program, as listed).
                    let target = app_label(&exe_of(pid.unwrap_or(0)));
                    for (p, s, _) in sessions()? {
                        if p == pid.unwrap_or(0) || (!target.is_empty() && app_label(&exe_of(p)) == target) {
                            if what == "app_volume" {
                                s.SetMasterVolume(v, std::ptr::null())?;
                            } else {
                                s.SetMute(on, std::ptr::null())?;
                            }
                        }
                    }
                    Ok(())
                }
                _ => Ok(()),
            }
        }
    }

    pub fn level() -> Option<f32> {
        unsafe {
            let m: IAudioMeterInformation = device(false).ok()?.Activate(CLSCTX_ALL, None).ok()?;
            m.GetPeakValue().ok()
        }
    }
}
