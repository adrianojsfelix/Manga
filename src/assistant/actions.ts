// What Manga does when asked in the chat: the AI writes [[acao {json}]] on a
// line (the protocol is in the system prompt, crates/manga-core/src/chat.rs);
// the island reads, checks and runs it, and the line leaves the answer.
// Pure: tested on its own.

import type { Station } from "../focus/lofi.ts";

export type Action =
  | { kind: "task"; text: string; date: string }
  | { kind: "pomodoro"; minutes: number | null }
  | { kind: "timer"; minutes: number }
  | { kind: "alarm"; time: string; label: string }
  | { kind: "reminder"; time: string; text: string }
  | { kind: "music"; station: Station | "stop" }
  | { kind: "note"; text: string }
  | { kind: "water" }
  | { kind: "open"; page: "today" | "focus" | "media" | "notes" | "controls" };

const STATIONS = ["beats", "chill", "jazz", "night", "bossa", "rain", "storm", "city", "forest", "sea", "brown"];
const PAGES: Record<string, Action & { kind: "open" }> = {
  hoje: { kind: "open", page: "today" },
  foco: { kind: "open", page: "focus" },
  midia: { kind: "open", page: "media" },
  mídia: { kind: "open", page: "media" },
  notas: { kind: "open", page: "notes" },
  controles: { kind: "open", page: "controls" },
};

const TAG = /\[\[\s*acao\s+(\{[^\n]*?\})\s*\]\]/gi;

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const hhmm = (v: unknown) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str(v));
  return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};
const minutes = (v: unknown) => (typeof v === "number" && v >= 1 && v <= 600 ? Math.round(v) : null);

export function toAction(raw: unknown): Action | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  switch (str(r.tipo).toLowerCase()) {
    case "tarefa": {
      const text = str(r.texto);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(str(r.data)) ? str(r.data) : "";
      return text ? { kind: "task", text, date } : null;
    }
    case "pomodoro":
      return { kind: "pomodoro", minutes: minutes(r.minutos) };
    case "timer": {
      const m = minutes(r.minutos);
      return m ? { kind: "timer", minutes: m } : null;
    }
    case "alarme": {
      const time = hhmm(r.hora);
      return time ? { kind: "alarm", time, label: str(r.nome, 60) } : null;
    }
    case "lembrete": {
      const time = hhmm(r.hora);
      return time ? { kind: "reminder", time, text: str(r.texto, 60) } : null;
    }
    case "musica":
    case "música": {
      const s = str(r.estilo).toLowerCase();
      if (s === "parar" || s === "stop") return { kind: "music", station: "stop" };
      return STATIONS.includes(s) ? { kind: "music", station: s as Station } : null;
    }
    case "nota": {
      const text = str(r.texto, 5000);
      return text ? { kind: "note", text } : null;
    }
    case "agua":
    case "água":
      return { kind: "water" };
    case "abrir":
      return PAGES[str(r.pagina).toLowerCase()] ?? null;
    default:
      return null;
  }
}

/** The answer without its action lines, and the actions in it (valid ones only). */
export function readActions(text: string): { clean: string; actions: Action[] } {
  const actions: Action[] = [];
  const clean = text
    .replace(TAG, (_, json: string) => {
      try {
        const a = toAction(JSON.parse(json));
        if (a) actions.push(a);
      } catch {
        /* not JSON: dropped */
      }
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { clean, actions };
}

/** An action still being written at the end of a streamed answer is hidden until it closes. */
export function hidePending(text: string): string {
  const i = text.lastIndexOf("[[");
  return i >= 0 && !text.slice(i).includes("]]") ? text.slice(0, i) : text;
}
