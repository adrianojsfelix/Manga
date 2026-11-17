//! Claude Code on the island: the hooks Manga adds to Claude Code's
//! settings.json (and takes out again, leaving the user's own untouched), and
//! the answers the island gives back to a permission or a question.

use serde_json::{json, Map, Value};

/// Where Claude Code's hooks reach the island.
pub const PORT: u16 = 31437;

pub fn url() -> String {
    format!("http://127.0.0.1:{PORT}/hook")
}

/// How long a hook may wait for the user on the island, in seconds (Claude
/// Code's own limit for it; the island gives the terminal back before).
pub const ASK_TIMEOUT: u64 = 600;

/// The events Manga listens to, the matcher and the timeout of each.
const EVENTS: [(&str, Option<&str>, u64); 7] = [
    ("SessionStart", None, 5),
    ("UserPromptSubmit", None, 5),
    ("PreToolUse", Some("*"), ASK_TIMEOUT),
    ("PermissionRequest", Some("*"), ASK_TIMEOUT),
    ("Notification", None, 5),
    ("Stop", None, 5),
    ("SessionEnd", None, 5),
];

fn ours(handler: &Value) -> bool {
    handler.get("url").and_then(Value::as_str).is_some_and(|u| u.starts_with(&format!("http://127.0.0.1:{PORT}/")))
}

/// Takes Manga's hooks out of a settings object; the rest stays as it was.
pub fn remove(settings: &mut Value) {
    let Some(hooks) = settings.get_mut("hooks").and_then(Value::as_object_mut) else { return };
    for groups in hooks.values_mut() {
        if let Some(list) = groups.as_array_mut() {
            for g in list.iter_mut() {
                if let Some(hs) = g.get_mut("hooks").and_then(Value::as_array_mut) {
                    hs.retain(|h| !ours(h));
                }
            }
            list.retain(|g| g.get("hooks").and_then(Value::as_array).map_or(true, |hs| !hs.is_empty()));
        }
    }
    hooks.retain(|_, groups| groups.as_array().map_or(true, |l| !l.is_empty()));
    if hooks.is_empty() {
        settings.as_object_mut().map(|o| o.remove("hooks"));
    }
}

/// Adds Manga's hooks (once, whatever was there before).
pub fn install(settings: &mut Value) -> Result<(), &'static str> {
    if !settings.is_object() {
        if settings.is_null() {
            *settings = Value::Object(Map::new());
        } else {
            return Err("settings.json is not an object");
        }
    }
    remove(settings);
    let root = settings.as_object_mut().unwrap();
    let hooks = root.entry("hooks").or_insert_with(|| Value::Object(Map::new()));
    let Some(hooks) = hooks.as_object_mut() else { return Err("\"hooks\" is not an object") };
    for (event, matcher, timeout) in EVENTS {
        let list = hooks.entry(event).or_insert_with(|| Value::Array(vec![]));
        let Some(list) = list.as_array_mut() else { return Err("a hook event is not a list") };
        let mut group = json!({ "hooks": [{ "type": "http", "url": url(), "timeout": timeout }] });
        if let Some(m) = matcher {
            group["matcher"] = json!(m);
        }
        list.push(group);
    }
    Ok(())
}

pub fn installed(settings: &Value) -> bool {
    let Some(hooks) = settings.get("hooks").and_then(Value::as_object) else { return false };
    EVENTS.iter().all(|(event, _, _)| {
        hooks.get(*event).and_then(Value::as_array).is_some_and(|l| {
            l.iter().any(|g| g.get("hooks").and_then(Value::as_array).is_some_and(|hs| hs.iter().any(ours)))
        })
    })
}

/// Whether a hook waits for the user on the island.
pub fn asks(event: &Value) -> Option<&'static str> {
    let name = event.get("hook_event_name").and_then(Value::as_str)?;
    let tool = event.get("tool_name").and_then(Value::as_str).unwrap_or("");
    match (name, tool) {
        ("PreToolUse", "AskUserQuestion") => Some("question"),
        ("PermissionRequest", "AskUserQuestion") => None, // answered as a question
        ("PermissionRequest", _) => Some("permission"),
        _ => None,
    }
}

/// The island's answer to a permission.
pub fn permission_answer(allow: bool, message: Option<&str>) -> Value {
    let mut decision = json!({ "behavior": if allow { "allow" } else { "deny" } });
    if !allow {
        decision["message"] = json!(message.unwrap_or("O usuário negou pela ilha do Manga."));
    }
    json!({ "hookSpecificOutput": { "hookEventName": "PermissionRequest", "decision": decision } })
}

/// The island's answer to AskUserQuestion: the questions as they came, and
/// for each its answer (several choices joined by ", ").
pub fn question_answer(tool_input: &Value, answers: &Map<String, Value>) -> Value {
    let mut input = tool_input.clone();
    if !input.is_object() {
        input = json!({});
    }
    input["answers"] = Value::Object(answers.clone());
    json!({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "updatedInput": input
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installing_keeps_the_users_hooks_and_settings_and_is_idempotent() {
        let mut s = json!({
            "model": "opus",
            "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "say done" }] }] }
        });
        install(&mut s).unwrap();
        install(&mut s).unwrap();
        assert!(installed(&s));
        assert_eq!(s["model"], "opus");
        let stop = s["hooks"]["Stop"].as_array().unwrap();
        assert_eq!(stop.len(), 2, "the user's and Manga's, once");
        assert_eq!(stop[0]["hooks"][0]["command"], "say done");
        assert_eq!(s["hooks"]["PreToolUse"][0]["matcher"], "*");
        assert_eq!(s["hooks"]["PermissionRequest"][0]["hooks"][0]["timeout"], ASK_TIMEOUT);
        // The keys keep their order (the user's file reads the same).
        assert_eq!(s.as_object().unwrap().keys().next().unwrap(), "model");

        remove(&mut s);
        assert!(!installed(&s));
        assert_eq!(s, json!({ "model": "opus", "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "say done" }] }] } }));
    }

    #[test]
    fn an_empty_file_gets_only_mangas_hooks_and_loses_them_cleanly() {
        let mut s = Value::Null;
        install(&mut s).unwrap();
        assert!(installed(&s));
        remove(&mut s);
        assert_eq!(s, json!({}));
        assert!(install(&mut json!([1])).is_err());
    }

    #[test]
    fn which_hooks_wait_for_the_user() {
        let q = json!({ "hook_event_name": "PreToolUse", "tool_name": "AskUserQuestion" });
        let p = json!({ "hook_event_name": "PermissionRequest", "tool_name": "Bash" });
        let pq = json!({ "hook_event_name": "PermissionRequest", "tool_name": "AskUserQuestion" });
        let t = json!({ "hook_event_name": "PreToolUse", "tool_name": "Bash" });
        assert_eq!(asks(&q), Some("question"));
        assert_eq!(asks(&p), Some("permission"));
        assert_eq!(asks(&pq), None);
        assert_eq!(asks(&t), None);
    }

    #[test]
    fn answers_as_claude_code_reads_them() {
        let allow = permission_answer(true, None);
        assert_eq!(allow["hookSpecificOutput"]["decision"], json!({ "behavior": "allow" }));
        let deny = permission_answer(false, None);
        assert_eq!(deny["hookSpecificOutput"]["decision"]["behavior"], "deny");
        assert!(deny["hookSpecificOutput"]["decision"]["message"].is_string());

        let input = json!({ "questions": [{ "question": "Qual?", "options": [{ "label": "A" }] }] });
        let mut answers = Map::new();
        answers.insert("Qual?".into(), json!("A"));
        let a = question_answer(&input, &answers);
        assert_eq!(a["hookSpecificOutput"]["permissionDecision"], "allow");
        assert_eq!(a["hookSpecificOutput"]["updatedInput"]["questions"], input["questions"]);
        assert_eq!(a["hookSpecificOutput"]["updatedInput"]["answers"]["Qual?"], "A");
    }
}
