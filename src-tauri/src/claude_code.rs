// Claude Code on the island. Manga adds HTTP hooks to Claude Code's
// settings.json that post each event to 127.0.0.1 (manga_core::hooks); this
// server hands them to the island: sessions working and done, the tool in
// use, and — waiting for the user — permissions and Claude's questions.
// With Manga closed the hooks fail to connect and Claude Code goes on as
// always, asking in the terminal.

use manga_core::{hooks, http};
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const MAX_BODY: usize = 4 * 1024 * 1024;
/// The island gives the terminal back a little before Claude Code's own limit.
const WAIT: Duration = Duration::from_secs(hooks::ASK_TIMEOUT - 20);

static LISTENING: AtomicBool = AtomicBool::new(false);
static NEXT: AtomicU64 = AtomicU64::new(1);
static PENDING: Mutex<Option<HashMap<u64, Sender<Value>>>> = Mutex::new(None);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Event {
    event: String,
    session: String,
    cwd: String,
    tool: String,
    input: Value,
    message: String,
    title: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Ask {
    id: u64,
    kind: &'static str,
    #[serde(flatten)]
    event: Event,
}

/// Long strings cut short: the island shows a summary, not a whole file.
fn trimmed(v: &Value, depth: u8) -> Value {
    match v {
        Value::String(s) if s.chars().count() > 600 => Value::String(format!("{}…", s.chars().take(600).collect::<String>())),
        Value::Array(a) if depth < 4 => Value::Array(a.iter().take(20).map(|x| trimmed(x, depth + 1)).collect()),
        Value::Object(o) if depth < 4 => Value::Object(o.iter().map(|(k, x)| (k.clone(), trimmed(x, depth + 1))).collect()),
        Value::Array(_) | Value::Object(_) => Value::Null,
        _ => v.clone(),
    }
}

fn text(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

fn event_of(v: &Value, full_input: bool) -> Event {
    let input = v.get("tool_input").cloned().unwrap_or(Value::Null);
    Event {
        event: text(v, "hook_event_name"),
        session: text(v, "session_id"),
        cwd: text(v, "cwd"),
        tool: text(v, "tool_name"),
        input: if full_input { input } else { trimmed(&input, 0) },
        message: if v.get("prompt").is_some() { text(v, "prompt").chars().take(300).collect() } else { text(v, "message") },
        title: text(v, "title"),
    }
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let listener = match TcpListener::bind(("127.0.0.1", hooks::PORT)) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[manga] Claude Code: port {} unavailable: {e}", hooks::PORT);
                return;
            }
        };
        LISTENING.store(true, Ordering::Relaxed);
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            std::thread::spawn(move || {
                let _ = serve(&app, stream);
            });
        }
    });
}

fn serve(app: &AppHandle, mut stream: TcpStream) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 8192];
    let head = loop {
        let n = stream.read(&mut chunk)?;
        if n == 0 {
            return Ok(());
        }
        buf.extend_from_slice(&chunk[..n]);
        match http::parse_head(&buf) {
            Some(Ok(h)) => break h,
            Some(Err(_)) => return stream.write_all(&http::response(400, "")),
            None if buf.len() > 64 * 1024 => return stream.write_all(&http::response(400, "")),
            None => {}
        }
    };
    if !http::acceptable(&head, MAX_BODY) {
        return stream.write_all(&http::response(403, ""));
    }
    while buf.len() < head.len + head.content_length {
        let n = stream.read(&mut chunk)?;
        if n == 0 {
            return Ok(());
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    let Ok(body) = serde_json::from_slice::<Value>(&buf[head.len..head.len + head.content_length]) else {
        return stream.write_all(&http::response(400, ""));
    };

    let Some(kind) = hooks::asks(&body) else {
        // News only: Claude Code goes on at once.
        stream.write_all(&http::response(200, ""))?;
        let _ = app.emit("cc-event", event_of(&body, false));
        return Ok(());
    };

    // Waits for the user on the island.
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = channel();
    PENDING.lock().unwrap().get_or_insert_with(HashMap::new).insert(id, tx);
    let _ = app.emit("cc-ask", Ask { id, kind, event: event_of(&body, kind == "question") });
    let started = Instant::now();
    let answer = loop {
        match rx.recv_timeout(Duration::from_millis(800)) {
            Ok(a) => break Some(a),
            Err(RecvTimeoutError::Disconnected) => break None,
            Err(RecvTimeoutError::Timeout) => {
                if started.elapsed() > WAIT || closed(&stream) {
                    break None;
                }
            }
        }
    };
    PENDING.lock().unwrap().as_mut().map(|m| m.remove(&id));
    let output = answer.and_then(|a| output(kind, &body, &a));
    if output.is_none() {
        // Answered elsewhere, or not at all: the island lets it go.
        let _ = app.emit("cc-ask-gone", id);
    }
    // An empty answer: Claude Code asks in the terminal, as without Manga.
    let reply = output.map(|o| o.to_string()).unwrap_or_default();
    stream.write_all(&http::response(200, &reply))
}

/// Whether Claude Code hung up (it stopped waiting).
fn closed(stream: &TcpStream) -> bool {
    let mut b = [0u8; 1];
    if stream.set_nonblocking(true).is_err() {
        return false;
    }
    let gone = matches!(stream.peek(&mut b), Ok(0));
    let _ = stream.set_nonblocking(false);
    gone
}

/// The island's answer, as Claude Code reads it; None gives the terminal back.
fn output(kind: &str, body: &Value, answer: &Value) -> Option<Value> {
    match (kind, answer.get("choice").and_then(Value::as_str)?) {
        ("permission", "allow") => Some(hooks::permission_answer(true, None)),
        ("permission", "deny") => Some(hooks::permission_answer(false, answer.get("message").and_then(Value::as_str))),
        ("question", "answers") => {
            let answers: Map<String, Value> = answer.get("answers")?.as_object()?.clone();
            Some(hooks::question_answer(body.get("tool_input").unwrap_or(&Value::Null), &answers))
        }
        _ => None,
    }
}

/// The island answers: {choice: "allow" | "deny" | "terminal" | "answers", answers?, message?}.
#[tauri::command]
pub fn claude_code_answer(id: u64, answer: Value) -> bool {
    let tx = PENDING.lock().unwrap().as_mut().and_then(|m| m.remove(&id));
    tx.is_some_and(|tx| tx.send(answer).is_ok())
}

fn settings_path() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("CLAUDE_CONFIG_DIR") {
        if !dir.is_empty() {
            return Some(PathBuf::from(dir).join("settings.json"));
        }
    }
    let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok()?;
    Some(PathBuf::from(home).join(".claude").join("settings.json"))
}

fn read_settings(path: &PathBuf) -> Result<Value, String> {
    match std::fs::read_to_string(path) {
        Ok(t) if t.trim().is_empty() => Ok(Value::Null),
        Ok(t) => serde_json::from_str(&t).map_err(|e| format!("O settings.json do Claude Code não é um JSON válido ({e}). Nada foi mudado.")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Value::Null),
        Err(e) => Err(format!("Não consegui ler o settings.json do Claude Code: {e}")),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    hooks: bool,
    listening: bool,
    path: String,
}

#[tauri::command]
pub fn claude_code_status() -> Status {
    let path = settings_path();
    let hooks = path.as_ref().and_then(|p| read_settings(p).ok()).is_some_and(|s| hooks::installed(&s));
    Status {
        hooks,
        listening: LISTENING.load(Ordering::Relaxed),
        path: path.map(|p| p.display().to_string()).unwrap_or_default(),
    }
}

/// Adds (on) or takes out (off) Manga's hooks in Claude Code's settings.json.
#[tauri::command]
pub fn claude_code_connect(on: bool) -> Result<Status, String> {
    let path = settings_path().ok_or("Não achei a pasta do usuário.")?;
    let mut settings = read_settings(&path)?;
    if on {
        hooks::install(&mut settings).map_err(|e| format!("O settings.json do Claude Code tem um formato inesperado ({e}). Nada foi mudado."))?;
    } else {
        if settings.is_null() {
            return Ok(claude_code_status());
        }
        hooks::remove(&mut settings);
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())? + "\n";
    // Written beside it, then swapped in: a half-written settings.json never stays.
    let tmp = path.with_extension("json.manga-tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("Não consegui salvar: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("Não consegui salvar: {e}"))?;
    Ok(claude_code_status())
}
