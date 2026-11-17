// A conversation with Kumo: the turns, the answer being written, and Kumo's
// mood along the way. Pure: the island draws it, Rust sends it.

import type { Mood } from "../mascot/kumo.ts";
import type { Provider } from "../core/settings.ts";

export interface Turn {
  role: "user" | "assistant";
  text: string;
  /** Which AI answered (assistant turns). */
  provider?: Provider;
  /** The answer ended in an error (shown, not sent back). */
  error?: boolean;
}

export type Phase = "idle" | "waiting" | "writing" | "done" | "error" | "refused";

export interface Conversation {
  turns: Turn[];
  phase: Phase;
  /** The request being answered. */
  pending: string | null;
}

export const EMPTY: Conversation = { turns: [], phase: "idle", pending: null };

/** How many turns go to the AI (the newest); older ones stay on screen only. */
export const SENT_TURNS = 20;

export function ask(c: Conversation, text: string, id: string, provider: Provider): Conversation {
  const q = text.trim();
  if (!q || c.pending) return c;
  return {
    turns: [...c.turns, { role: "user", text: q }, { role: "assistant", text: "", provider }],
    phase: "waiting",
    pending: id,
  };
}

function updateLast(c: Conversation, f: (t: Turn) => Turn): Turn[] {
  const turns = c.turns.slice();
  turns[turns.length - 1] = f(turns[turns.length - 1]);
  return turns;
}

export function delta(c: Conversation, id: string, text: string): Conversation {
  if (c.pending !== id || !text) return c;
  return { ...c, phase: "writing", turns: updateLast(c, (t) => ({ ...t, text: t.text + text })) };
}

export function done(c: Conversation, id: string, error: string | null, refused: boolean): Conversation {
  if (c.pending !== id) return c;
  if (error) {
    return { turns: updateLast(c, (t) => ({ ...t, text: t.text ? `${t.text}\n\n${error}` : error, error: true })), phase: "error", pending: null };
  }
  return { ...c, phase: refused ? "refused" : "done", pending: null };
}

/** The turns sent to the AI: answered ones, newest last, starting with the user's. */
export function toSend(c: Conversation): { role: "user" | "assistant"; text: string }[] {
  // The empty answer being written is not sent; failed answers neither, with their question.
  const out: { role: "user" | "assistant"; text: string }[] = [];
  const turns = c.turns.filter((t, i) => !(t.role === "assistant" && t.text === "" && i === c.turns.length - 1));
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.error) continue;
    if (t.role === "user" && turns[i + 1]?.error) continue;
    out.push({ role: t.role, text: t.text });
  }
  let recent = out.slice(-SENT_TURNS);
  while (recent.length && recent[0].role !== "user") recent = recent.slice(1);
  return recent;
}

/** Kumo's face for where the conversation is. */
export function moodOf(phase: Phase): Mood {
  switch (phase) {
    case "waiting": return "thinking";
    case "writing": return "working";
    case "done": return "happy";
    case "error": return "sad";
    case "refused": return "surprised";
    default: return "idle";
  }
}
