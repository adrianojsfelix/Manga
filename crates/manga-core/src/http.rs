//! Just enough HTTP/1.1 for Claude Code's hooks to reach the island on
//! 127.0.0.1: one request per connection, a JSON body, a JSON answer.

/// A request's head, once it has fully arrived.
#[derive(Debug, PartialEq)]
pub struct Head {
    pub method: String,
    pub path: String,
    pub content_length: usize,
    pub content_type: String,
    /// Sent by browsers: a web page must not reach the island.
    pub has_origin: bool,
    /// Bytes the head takes, body excluded.
    pub len: usize,
}

/// Reads the head from what has arrived so far: None until it is complete.
pub fn parse_head(buf: &[u8]) -> Option<Result<Head, &'static str>> {
    let end = buf.windows(4).position(|w| w == b"\r\n\r\n")?;
    let text = match std::str::from_utf8(&buf[..end]) {
        Ok(t) => t,
        Err(_) => return Some(Err("head is not text")),
    };
    let mut lines = text.split("\r\n");
    let mut first = lines.next().unwrap_or("").split(' ');
    let (Some(method), Some(path)) = (first.next(), first.next()) else {
        return Some(Err("bad request line"));
    };
    let mut head = Head {
        method: method.to_string(),
        path: path.to_string(),
        content_length: 0,
        content_type: String::new(),
        has_origin: false,
        len: end + 4,
    };
    for line in lines {
        let Some((name, value)) = line.split_once(':') else { continue };
        let value = value.trim();
        match name.trim().to_ascii_lowercase().as_str() {
            "content-length" => match value.parse() {
                Ok(n) => head.content_length = n,
                Err(_) => return Some(Err("bad content-length")),
            },
            "content-type" => head.content_type = value.to_ascii_lowercase(),
            "origin" => head.has_origin = true,
            _ => {}
        }
    }
    Some(Ok(head))
}

/// Whether the island takes this request: a hook's POST of JSON, not a web page's.
pub fn acceptable(h: &Head, max_body: usize) -> bool {
    h.method == "POST" && h.path.starts_with("/hook") && !h.has_origin && h.content_type.starts_with("application/json") && h.content_length <= max_body
}

pub fn response(status: u16, body: &str) -> Vec<u8> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        403 => "Forbidden",
        _ => "Error",
    };
    let kind = if body.is_empty() { "text/plain" } else { "application/json" };
    format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
    .into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_hook_post_when_its_head_is_complete() {
        let raw = b"POST /hook HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}";
        assert!(parse_head(&raw[..20]).is_none());
        let h = parse_head(raw).unwrap().unwrap();
        assert_eq!((h.method.as_str(), h.path.as_str(), h.content_length), ("POST", "/hook", 2));
        assert_eq!(&raw[h.len..], b"{}");
        assert!(acceptable(&h, 1024));
    }

    #[test]
    fn web_pages_and_other_requests_are_refused() {
        let page = b"POST /hook HTTP/1.1\r\nOrigin: https://evil.example\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n";
        assert!(!acceptable(&parse_head(page).unwrap().unwrap(), 1024));
        let form = b"POST /hook HTTP/1.1\r\nContent-Type: text/plain\r\nContent-Length: 2\r\n\r\n";
        assert!(!acceptable(&parse_head(form).unwrap().unwrap(), 1024));
        let get = b"GET /hook HTTP/1.1\r\n\r\n";
        assert!(!acceptable(&parse_head(get).unwrap().unwrap(), 1024));
        let big = b"POST /hook HTTP/1.1\r\nContent-Type: application/json\r\nContent-Length: 99999\r\n\r\n";
        assert!(!acceptable(&parse_head(big).unwrap().unwrap(), 1024));
    }

    #[test]
    fn answers_with_its_length() {
        let r = String::from_utf8(response(200, "{\"a\":1}")).unwrap();
        assert!(r.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(r.contains("Content-Length: 7\r\n"));
        assert!(r.ends_with("\r\n\r\n{\"a\":1}"));
    }
}
