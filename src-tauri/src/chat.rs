// Kumo's chat: Claude and Gemini, with the user's API key (kept in Windows'
// Credential Manager, used only here) or with their subscription, through
// the Claude Code or Gemini CLI already signed in on this PC.
//
// The answer streams to the page as "chat-delta" events and ends with one
// "chat-done". What is sent and read is built in manga-core::chat (tested).

use futures_util::StreamExt;
use manga_core::chat::{self as core, Piece, Turn};
use manga_core::sse::SseParser;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static CANCELLED: Mutex<Option<HashSet<String>>> = Mutex::new(None);

fn cancelled(id: &str) -> bool {
    CANCELLED.lock().unwrap().as_ref().is_some_and(|s| s.contains(id))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub id: String,
    /// "claude" or "gemini".
    pub provider: String,
    /// "key" or "subscription".
    pub mode: String,
    pub model: Option<String>,
    pub turns: Vec<Turn>,
}

#[derive(Serialize, Clone)]
struct Delta<'a> {
    id: &'a str,
    text: &'a str,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Done<'a> {
    id: &'a str,
    error: Option<String>,
    refused: bool,
}

#[tauri::command]
pub fn chat_cancel(id: String) {
    CANCELLED.lock().unwrap().get_or_insert_with(HashSet::new).insert(id);
}

#[tauri::command]
pub async fn chat_send(app: AppHandle, request: ChatRequest) {
    let id = request.id.clone();
    let result = match (request.provider.as_str(), request.mode.as_str()) {
        ("claude", "subscription") => cli(&app, &id, "claude", &["-p"], &request.turns).await,
        ("gemini", "subscription") => cli(&app, &id, "gemini", &[], &request.turns).await,
        ("claude", _) => claude(&app, &id, request.model.as_deref(), &request.turns).await,
        ("gemini", _) => gemini(&app, &id, request.model.as_deref(), &request.turns).await,
        _ => Err("Provedor desconhecido.".to_string()),
    };
    let (error, refused) = match result {
        Ok(refused) => (None, refused),
        Err(e) => (Some(e), false),
    };
    let _ = app.emit("chat-done", Done { id: &id, error, refused });
    if let Some(set) = CANCELLED.lock().unwrap().as_mut() {
        set.remove(&id);
    }
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Manga")
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}

/// Reads an SSE stream, sending each piece of text to the page. Ok(refused).
async fn stream(app: &AppHandle, id: &str, resp: reqwest::Response, read: impl Fn(Option<&str>, &str) -> Piece) -> Result<bool, String> {
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(http_error(status.as_u16(), &body));
    }
    let mut parser = SseParser::new();
    let mut bytes = resp.bytes_stream();
    let mut refused = false;
    while let Some(chunk) = bytes.next().await {
        if cancelled(id) {
            return Ok(false);
        }
        let chunk = chunk.map_err(|e| e.to_string())?;
        for ev in parser.push(&chunk) {
            match read(ev.event.as_deref(), &ev.data) {
                Piece::Text(t) => {
                    let _ = app.emit("chat-delta", Delta { id, text: &t });
                }
                Piece::Done { refused: r } => refused |= r,
                Piece::Error(e) => return Err(e),
                Piece::Nothing => {}
            }
        }
    }
    Ok(refused)
}

/// An HTTP error as a sentence the user can act on.
fn http_error(status: u16, body: &str) -> String {
    let detail = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
        .unwrap_or_default();
    match status {
        401 | 403 => "A chave não foi aceita. Confira nas Configurações.".to_string(),
        429 => "Muitos pedidos agora. Tente de novo em instantes.".to_string(),
        529 | 503 => "O serviço está sobrecarregado. Tente de novo em instantes.".to_string(),
        _ if !detail.is_empty() => detail,
        _ => format!("Erro {status}."),
    }
}

async fn claude(app: &AppHandle, id: &str, model: Option<&str>, turns: &[Turn]) -> Result<bool, String> {
    let key = crate::secrets::get("anthropic").ok_or("Adicione sua chave do Claude nas Configurações.")?;
    let body = core::claude_body(model.unwrap_or(core::CLAUDE_MODEL), turns);
    let resp = client()?
        .post(core::CLAUDE_URL)
        .header("x-api-key", key)
        .header("anthropic-version", core::CLAUDE_VERSION)
        .header("anthropic-beta", core::CLAUDE_BETA)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Sem conexão com o Claude: {e}"))?;
    stream(app, id, resp, core::claude_piece).await
}

async fn gemini(app: &AppHandle, id: &str, model: Option<&str>, turns: &[Turn]) -> Result<bool, String> {
    let key = crate::secrets::get("gemini").ok_or("Adicione sua chave do Gemini nas Configurações.")?;
    let resp = client()?
        .post(core::gemini_url(model.unwrap_or(core::GEMINI_MODEL)))
        .header("x-goog-api-key", key)
        .json(&core::gemini_body(turns))
        .send()
        .await
        .map_err(|e| format!("Sem conexão com o Gemini: {e}"))?;
    stream(app, id, resp, |_, data| core::gemini_piece(data)).await
}

/// The Claude Code or Gemini CLI, signed in with the user's own account:
/// the conversation goes in on stdin, the answer comes out as it is written.
async fn cli(app: &AppHandle, id: &str, tool: &str, args: &[&str], turns: &[Turn]) -> Result<bool, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let mut cmd = if cfg!(windows) {
        // npm installs them as .cmd shims: cmd finds them on the PATH.
        let mut c = tokio::process::Command::new("cmd");
        c.arg("/C").arg(tool).args(args);
        c
    } else {
        let mut c = tokio::process::Command::new(tool);
        c.args(args);
        c
    };
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let mut child = cmd
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| format!("Não encontrei o {tool} neste PC. Instale e faça login, ou use uma chave."))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(core::transcript(turns).as_bytes()).await.map_err(|e| e.to_string())?;
    }
    let mut out = child.stdout.take().ok_or("sem saída")?;
    let mut buf = [0u8; 4096];
    let mut any = false;
    loop {
        if cancelled(id) {
            let _ = child.kill().await;
            return Ok(false);
        }
        let n = out.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        any = true;
        let text = String::from_utf8_lossy(&buf[..n]);
        let _ = app.emit("chat-delta", Delta { id, text: &text });
    }
    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() && !any {
        let mut err = String::new();
        if let Some(mut e) = child.stderr.take() {
            let _ = e.read_to_string(&mut err).await;
        }
        let first = err.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
        return Err(if first.is_empty() { format!("O {tool} não respondeu. Ele está logado?") } else { first });
    }
    Ok(false)
}
