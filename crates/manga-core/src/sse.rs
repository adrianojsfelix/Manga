//! Server-sent events, as the Claude and Gemini APIs stream their answers:
//! lines of `event:` and `data:` separated by blank lines. Bytes arrive in
//! pieces cut anywhere; `SseParser` keeps the unfinished line between them.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseEvent {
    pub event: Option<String>,
    pub data: String,
}

#[derive(Default)]
pub struct SseParser {
    line: Vec<u8>,
    event: Option<String>,
    data: Vec<String>,
}

impl SseParser {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feeds a piece of the stream; returns the events it completed.
    pub fn push(&mut self, bytes: &[u8]) -> Vec<SseEvent> {
        let mut out = Vec::new();
        for &b in bytes {
            if b == b'\n' {
                let raw = std::mem::take(&mut self.line);
                let line = String::from_utf8_lossy(&raw);
                let line = line.strip_suffix('\r').unwrap_or(&line).to_string();
                self.line_done(&line, &mut out);
            } else {
                self.line.push(b);
            }
        }
        out
    }

    fn line_done(&mut self, line: &str, out: &mut Vec<SseEvent>) {
        if line.is_empty() {
            if !self.data.is_empty() || self.event.is_some() {
                out.push(SseEvent { event: self.event.take(), data: self.data.join("\n") });
                self.data.clear();
            }
            return;
        }
        if line.starts_with(':') {
            return; // a comment (keep-alive)
        }
        let (field, value) = match line.split_once(':') {
            Some((f, v)) => (f, v.strip_prefix(' ').unwrap_or(v)),
            None => (line, ""),
        };
        match field {
            "event" => self.event = Some(value.to_string()),
            "data" => self.data.push(value.to_string()),
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_survive_being_cut_anywhere() {
        let stream = b"event: content_block_delta\r\ndata: {\"a\":1}\r\n\r\n: ping\n\nevent: message_stop\ndata: {}\n\n";
        for cut in 1..stream.len() {
            let mut p = SseParser::new();
            let mut got = p.push(&stream[..cut]);
            got.extend(p.push(&stream[cut..]));
            assert_eq!(got.len(), 2, "cut at {cut}");
            assert_eq!(got[0], SseEvent { event: Some("content_block_delta".into()), data: "{\"a\":1}".into() });
            assert_eq!(got[1].event.as_deref(), Some("message_stop"));
        }
    }

    #[test]
    fn data_lines_join() {
        let mut p = SseParser::new();
        let got = p.push(b"data: one\ndata: two\n\n");
        assert_eq!(got, vec![SseEvent { event: None, data: "one\ntwo".into() }]);
    }
}
