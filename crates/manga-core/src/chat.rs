//! What the chat sends to Claude and Gemini, and what it reads back from
//! their streams. Raw HTTP (there is no official Rust SDK), built and read
//! here so it is tested; src-tauri sends it.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Turn {
    /// "user" or "assistant".
    pub role: String,
    pub text: String,
}

/// Manga's character, for both AIs.
pub const SYSTEM: &str = "Você é o Manga, o assistente que mora numa ilha no topo do Windows: uma bolinha simpática. \
Responda em português do Brasil (ou na língua da pessoa), de forma curta e direta, como numa conversa: \
a ilha é pequena, então prefira poucas frases e listas curtas, e use Markdown só quando ajudar.";

/// What Manga can do for the person: the AI writes an action on a line of
/// its own and the island does it (src/assistant/actions.ts reads them).
pub const ACTIONS: &str = "Você pode agir no Manga: quando a pessoa pedir algo que ele faz, escreva a ação numa linha só, \
no formato [[acao {json}]], e confirme numa frase curta. Ações:
[[acao {\"tipo\":\"tarefa\",\"texto\":\"...\",\"data\":\"AAAA-MM-DD\"}]] cria uma tarefa (data opcional);
[[acao {\"tipo\":\"pomodoro\"}]] começa um foco (opcional \"minutos\");
[[acao {\"tipo\":\"timer\",\"minutos\":10}]] começa um timer;
[[acao {\"tipo\":\"alarme\",\"hora\":\"HH:MM\",\"nome\":\"...\"}]] cria um alarme;
[[acao {\"tipo\":\"lembrete\",\"hora\":\"HH:MM\",\"texto\":\"...\"}]] lembra a pessoa num horário de hoje;
[[acao {\"tipo\":\"musica\",\"estilo\":\"beats\"}]] toca música (beats, chill, jazz, night, bossa, rain, storm, city, forest, sea, brown ou parar);
[[acao {\"tipo\":\"nota\",\"texto\":\"...\"}]] guarda uma nota;
[[acao {\"tipo\":\"agua\"}]] conta um copo d'água;
[[acao {\"tipo\":\"abrir\",\"pagina\":\"hoje\"}]] abre uma página (hoje, foco, midia, notas, controles).
Não invente ações que a pessoa não pediu.";

/// The system prompt: Manga's character, what he can do, and (when the
/// person lets him) what is going on in their day now.
pub fn system(context: &str) -> String {
    let mut s = format!("{SYSTEM}\n\n{ACTIONS}");
    if !context.trim().is_empty() {
        s.push_str("\n\nO que está acontecendo agora (use quando ajudar a responder):\n");
        s.push_str(context.trim());
    }
    s
}

pub const CLAUDE_URL: &str = "https://api.anthropic.com/v1/messages";
pub const CLAUDE_MODEL: &str = "claude-opus-5-5";

/// The Messages API request: streamed, Kumo's system prompt, and the
/// server-side fallback so a declined request is answered by another model.
pub fn claude_body(model: &str, turns: &[Turn], context: &str) -> Value {
    let messages: Vec<Value> = turns
        .iter()
        .filter(|t| !t.text.trim().is_empty())
        .map(|t| json!({ "role": if t.role == "assistant" { "assistant" } else { "user" }, "content": t.text }))
        .collect();
    json!({
        "model": model,
        "max_tokens": 16000,
        "stream": true,
        "system": system(context),
        "fallbacks": "default",
        "messages": messages,
    })
}

/// The headers the Messages API needs besides the key.
pub const CLAUDE_VERSION: &str = "2023-06-01";
pub const CLAUDE_BETA: &str = "server-side-fallback-2026-07-01";

/// What one event of Claude's stream means for the chat.
#[derive(Debug, PartialEq)]
pub enum Piece {
    Text(String),
    /// The answer is over; `refused` when the model (and its fallback) declined.
    Done { refused: bool },
    Error(String),
    Nothing,
}

pub fn claude_piece(event: Option<&str>, data: &str) -> Piece {
    let Ok(v) = serde_json::from_str::<Value>(data) else { return Piece::Nothing };
    let kind = event.or_else(|| v["type"].as_str()).unwrap_or("");
    match kind {
        "content_block_delta" if v["delta"]["type"] == "text_delta" => {
            Piece::Text(v["delta"]["text"].as_str().unwrap_or("").to_string())
        }
        "message_delta" if v["delta"]["stop_reason"] == "refusal" => Piece::Done { refused: true },
        "message_stop" => Piece::Done { refused: false },
        "error" => Piece::Error(v["error"]["message"].as_str().unwrap_or("error").to_string()),
        _ => Piece::Nothing,
    }
}

pub const GEMINI_MODEL: &str = "gemini-2.5-flash";

pub fn gemini_url(model: &str) -> String {
    format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse")
}

pub fn gemini_body(turns: &[Turn], context: &str) -> Value {
    let contents: Vec<Value> = turns
        .iter()
        .filter(|t| !t.text.trim().is_empty())
        .map(|t| json!({ "role": if t.role == "assistant" { "model" } else { "user" }, "parts": [{ "text": t.text }] }))
        .collect();
    json!({ "systemInstruction": { "parts": [{ "text": system(context) }] }, "contents": contents })
}

/// The text in one event of Gemini's stream (each carries the next piece).
pub fn gemini_piece(data: &str) -> Piece {
    let Ok(v) = serde_json::from_str::<Value>(data) else { return Piece::Nothing };
    if let Some(msg) = v["error"]["message"].as_str() {
        return Piece::Error(msg.to_string());
    }
    let parts = v["candidates"][0]["content"]["parts"].as_array();
    let text: String = parts.map(|ps| ps.iter().filter_map(|p| p["text"].as_str()).collect()).unwrap_or_default();
    if !text.is_empty() {
        return Piece::Text(text);
    }
    match v["candidates"][0]["finishReason"].as_str() {
        Some("SAFETY") | Some("PROHIBITED_CONTENT") => Piece::Done { refused: true },
        Some(_) => Piece::Done { refused: false },
        None => Piece::Nothing,
    }
}

/// The whole conversation as one prompt, for a command-line AI (Claude Code,
/// Gemini CLI) that takes a single question.
pub fn transcript(turns: &[Turn], context: &str) -> String {
    let mut out = format!("{}\n\n", system(context));
    let last = turns.len().saturating_sub(1);
    for (i, t) in turns.iter().enumerate() {
        if i == last && t.role == "user" {
            out.push_str(&format!("Pergunta: {}\n", t.text));
        } else {
            let who = if t.role == "assistant" { "Manga" } else { "Pessoa" };
            out.push_str(&format!("{who}: {}\n", t.text));
        }
    }
    out
}

#[cfg(test)]
mod context_tests {
    use super::*;

    #[test]
    fn the_day_goes_in_the_system_prompt_only_when_given() {
        assert!(system("").contains("[[acao"));
        assert!(!system("").contains("acontecendo agora"));
        let s = system("Hoje: terça. Tarefas: relatório.");
        assert!(s.starts_with(SYSTEM));
        assert!(s.ends_with("Hoje: terça. Tarefas: relatório."));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn turns() -> Vec<Turn> {
        vec![
            Turn { role: "user".into(), text: "Oi".into() },
            Turn { role: "assistant".into(), text: "Olá!".into() },
            Turn { role: "user".into(), text: "Que horas são em Tóquio?".into() },
        ]
    }

    #[test]
    fn claude_gets_the_conversation_streamed_with_a_fallback() {
        let b = claude_body(CLAUDE_MODEL, &turns(), "");
        assert_eq!(b["model"], "claude-opus-5-5");
        assert_eq!(b["stream"], true);
        assert_eq!(b["fallbacks"], "default");
        assert_eq!(b["messages"].as_array().unwrap().len(), 3);
        assert_eq!(b["messages"][1]["role"], "assistant");
        assert!(b.get("thinking").is_none(), "Opus 5.5 thinks adaptively by itself");
    }

    #[test]
    fn claude_stream_pieces() {
        assert_eq!(
            claude_piece(Some("content_block_delta"), r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Oi"}}"#),
            Piece::Text("Oi".into())
        );
        assert_eq!(claude_piece(Some("content_block_delta"), r#"{"delta":{"type":"thinking_delta","thinking":""}}"#), Piece::Nothing);
        assert_eq!(claude_piece(Some("message_delta"), r#"{"delta":{"stop_reason":"refusal"}}"#), Piece::Done { refused: true });
        assert_eq!(claude_piece(Some("message_stop"), "{}"), Piece::Done { refused: false });
        assert_eq!(claude_piece(Some("error"), r#"{"error":{"type":"overloaded_error","message":"Overloaded"}}"#), Piece::Error("Overloaded".into()));
    }

    #[test]
    fn gemini_gets_model_turns_and_streams_text() {
        let b = gemini_body(&turns(), "");
        assert_eq!(b["contents"][1]["role"], "model");
        assert!(gemini_url("gemini-2.5-flash").ends_with("gemini-2.5-flash:streamGenerateContent?alt=sse"));
        assert_eq!(gemini_piece(r#"{"candidates":[{"content":{"parts":[{"text":"Olá"},{"text":"!"}]}}]}"#), Piece::Text("Olá!".into()));
        assert_eq!(gemini_piece(r#"{"candidates":[{"finishReason":"STOP"}]}"#), Piece::Done { refused: false });
        assert_eq!(gemini_piece(r#"{"error":{"message":"API key not valid"}}"#), Piece::Error("API key not valid".into()));
    }

    #[test]
    fn a_command_line_ai_reads_the_conversation_as_one_prompt() {
        let p = transcript(&turns(), "");
        assert!(p.contains("Pessoa: Oi\nManga: Olá!\nPergunta: Que horas são em Tóquio?"));
    }
}
