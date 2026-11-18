// Manga's voice through a speech server running on this PC (like
// VoiceStudio, which serves an OpenAI-style API on 127.0.0.1:3900). Only
// addresses on this computer: what Manga says never leaves it. The
// Windows voices need nothing of this (the page speaks them itself).

use serde_json::{json, Value};

fn local(base: &str) -> Result<String, String> {
    let b = base.trim().trim_end_matches('/');
    let ok = ["http://127.0.0.1:", "http://localhost:", "http://[::1]:"].iter().any(|p| b.starts_with(p));
    if !ok {
        return Err("Só um servidor de voz neste PC (http://127.0.0.1:porta).".into());
    }
    Ok(b.to_string())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().timeout(std::time::Duration::from_secs(60)).no_proxy().build().map_err(|e| e.to_string())
}

/// Speech for `text`, as a data: URL to play.
#[tauri::command]
pub async fn voice_speak(base: String, voice: String, model: String, text: String) -> Result<String, String> {
    let base = local(&base)?;
    let mut body = json!({ "input": text.chars().take(1500).collect::<String>(), "voice": voice, "response_format": "mp3" });
    if !model.trim().is_empty() {
        body["model"] = json!(model.trim());
    }
    let resp = client()?
        .post(format!("{base}/v1/audio/speech"))
        .json(&body)
        .send()
        .await
        .map_err(|_| "O servidor de voz não respondeu. Ele está aberto?".to_string())?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let detail = resp.text().await.unwrap_or_default();
        return Err(format!("O servidor de voz respondeu {status}. {}", detail.chars().take(200).collect::<String>()));
    }
    let kind = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("audio/mpeg").to_string();
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let kind = if kind.starts_with("audio/") { kind } else { "audio/mpeg".into() };
    Ok(format!("data:{kind};base64,{}", manga_core::media::base64(&bytes)))
}

/// The voices the server offers (by name), when it lists them.
#[tauri::command]
pub async fn voice_list(base: String) -> Result<Vec<String>, String> {
    let base = local(&base)?;
    let c = client()?;
    for path in ["/v1/audio/voices", "/v1/voices", "/api/voices"] {
        let Ok(r) = c.get(format!("{base}{path}")).send().await else { continue };
        if !r.status().is_success() {
            continue;
        }
        let Ok(v) = r.json::<Value>().await else { continue };
        let list = v.get("voices").or_else(|| v.get("data")).cloned().unwrap_or(v);
        let names: Vec<String> = list
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(str::to_string).or_else(|| ["id", "name", "voice_id"].iter().find_map(|k| x.get(*k).and_then(Value::as_str).map(str::to_string))))
                    .collect()
            })
            .unwrap_or_default();
        if !names.is_empty() {
            return Ok(names);
        }
    }
    Err("Não consegui a lista de vozes; escreva o nome da voz.".into())
}

#[derive(serde::Serialize)]
pub struct WinVoice {
    pub id: String,
    pub name: String,
    pub lang: String,
    /// "female" | "male".
    pub gender: String,
}

/// The voices installed in Windows (Settings → Time & language → Speech).
#[tauri::command]
pub async fn windows_voices() -> Vec<WinVoice> {
    tauri::async_runtime::spawn_blocking(win::voices).await.unwrap_or_default()
}

/// Speech from one of Windows' voices, as a data: URL (a WAV) to play.
#[tauri::command]
pub async fn windows_speak(text: String, voice: String, rate: f64) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || win::speak(&text, &voice, rate)).await.map_err(|e| e.to_string())?
}

#[cfg(not(windows))]
mod win {
    pub fn voices() -> Vec<super::WinVoice> {
        vec![]
    }
    pub fn speak(_: &str, _: &str, _: f64) -> Result<String, String> {
        Err("Só no Windows.".into())
    }
}

#[cfg(windows)]
mod win {
    use super::WinVoice;
    use windows::core::HSTRING;
    use windows::Media::SpeechSynthesis::{SpeechSynthesizer, VoiceGender};
    use windows::Storage::Streams::DataReader;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    fn init() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    pub fn voices() -> Vec<WinVoice> {
        init();
        let Ok(all) = SpeechSynthesizer::AllVoices() else { return vec![] };
        all.into_iter()
            .filter_map(|v| {
                Some(WinVoice {
                    id: v.Id().ok()?.to_string(),
                    name: v.DisplayName().ok()?.to_string(),
                    lang: v.Language().ok()?.to_string(),
                    gender: if v.Gender().ok()? == VoiceGender::Male { "male" } else { "female" }.into(),
                })
            })
            .collect()
    }

    pub fn speak(text: &str, voice: &str, rate: f64) -> Result<String, String> {
        init();
        let fail = |e: windows::core::Error| format!("A voz do Windows falhou: {}", e.message());
        let synth = SpeechSynthesizer::new().map_err(fail)?;
        if !voice.is_empty() {
            if let Ok(all) = SpeechSynthesizer::AllVoices() {
                if let Some(v) = all.into_iter().find(|v| v.Id().map(|id| id.to_string() == voice).unwrap_or(false)) {
                    synth.SetVoice(&v).map_err(fail)?;
                }
            }
        }
        if let Ok(o) = synth.Options() {
            let _ = o.SetSpeakingRate(rate.clamp(0.5, 2.0));
        }
        let stream = synth.SynthesizeTextToStreamAsync(&HSTRING::from(text)).map_err(fail)?.get().map_err(fail)?;
        let size = stream.Size().map_err(fail)? as u32;
        let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0).map_err(fail)?).map_err(fail)?;
        reader.LoadAsync(size).map_err(fail)?.get().map_err(fail)?;
        let mut buf = vec![0u8; size as usize];
        reader.ReadBytes(&mut buf).map_err(fail)?;
        Ok(format!("data:audio/wav;base64,{}", manga_core::media::base64(&buf)))
    }
}
