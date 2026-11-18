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
