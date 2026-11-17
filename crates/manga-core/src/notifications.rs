//! Other apps' notifications, as Windows keeps them: the app's id turned
//! into a name, Windows' time into Unix time, and the toast's XML into a
//! title and a body.

/// A Windows FILETIME (100 ns since 1601) as Unix milliseconds.
pub fn filetime_to_ms(ft: i64) -> i64 {
    ft / 10_000 - 11_644_473_600_000
}

/// A readable name from an app's id when Windows has none on file:
/// "5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App" → "WhatsApp Desktop".
pub fn app_name(aumid: &str) -> String {
    let id = aumid.trim();
    if id.contains('\\') || id.contains('/') {
        let file = id.rsplit(['\\', '/']).next().unwrap_or(id);
        return file.trim_end_matches(".exe").trim_end_matches(".EXE").to_string();
    }
    let family = id.split('!').next().unwrap_or(id);
    let name = family.split('_').next().unwrap_or(family);
    let mut out = name.rsplit('.').next().unwrap_or(name).to_string();
    for suffix in ["Desktop", "Beta", "Preview", "Music", "Mail"] {
        if out.len() > suffix.len() && out.ends_with(suffix) {
            out.insert(out.len() - suffix.len(), ' ');
            break;
        }
    }
    if out.is_empty() { id.to_string() } else { out }
}

fn decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        let tail = &rest[i..];
        let Some(end) = tail.find(';') else {
            out.push_str(tail);
            return out;
        };
        let ent = &tail[1..end];
        let ch = match ent {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ if ent.starts_with("#x") => u32::from_str_radix(&ent[2..], 16).ok().and_then(char::from_u32),
            _ if ent.starts_with('#') => ent[1..].parse().ok().and_then(char::from_u32),
            _ => None,
        };
        match ch {
            Some(c) => out.push(c),
            None => out.push_str(&tail[..=end]),
        }
        rest = &tail[end + 1..];
    }
    out.push_str(rest);
    out
}

/// The texts of a toast: the first is the title, the others the body.
/// The app's attribution line ("via Chrome") is left out.
pub fn toast_text(payload: &str) -> (String, String) {
    let mut texts = Vec::new();
    let mut rest = payload;
    while let Some(start) = rest.find("<text") {
        let after = &rest[start + 5..];
        // `<textbox` or anything else that only starts like it.
        if !after.starts_with('>') && !after.starts_with(' ') {
            rest = after;
            continue;
        }
        let Some(open_end) = after.find('>') else { break };
        let attrs = &after[..open_end];
        let body_start = &after[open_end + 1..];
        let Some(close) = body_start.find("</text>") else { break };
        let raw = &body_start[..close];
        rest = &body_start[close + 7..];
        if attrs.contains("attribution") {
            continue;
        }
        let raw = raw.replace("<![CDATA[", "").replace("]]>", "");
        let text = decode(raw.trim()).split_whitespace().collect::<Vec<_>>().join(" ");
        if !text.is_empty() {
            texts.push(text);
        }
    }
    let title = texts.first().cloned().unwrap_or_default();
    let body = texts.iter().skip(1).cloned().collect::<Vec<_>>().join(" · ");
    (title, body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_read_well() {
        assert_eq!(app_name("5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App"), "WhatsApp Desktop");
        assert_eq!(app_name("MSTeams_8wekyb3d8bbwe!MSTeams"), "MSTeams");
        assert_eq!(app_name(r"C:\Program Files\Slack\slack.exe"), "slack");
        assert_eq!(app_name("Chrome"), "Chrome");
    }

    #[test]
    fn filetime_is_unix_ms() {
        assert_eq!(filetime_to_ms(133_485_408_000_000_000), 1_704_067_200_000);
    }

    #[test]
    fn a_toast_has_a_title_and_a_body() {
        let xml = r#"<toast><visual><binding template="ToastGeneric"><text>Ana</text><text>Oi! Tudo &amp; mais?</text><text placement="attribution">via Chrome</text></binding></visual></toast>"#;
        assert_eq!(toast_text(xml), ("Ana".into(), "Oi! Tudo & mais?".into()));
        assert_eq!(toast_text("<toast><text><![CDATA[Olá]]></text><text>A</text><text>B</text></toast>"), ("Olá".into(), "A · B".into()));
        assert_eq!(toast_text("<toast/>"), (String::new(), String::new()));
        assert_eq!(toast_text("<text>&#x1F600; &#65;</text>").0, "😀 A");
    }
}
