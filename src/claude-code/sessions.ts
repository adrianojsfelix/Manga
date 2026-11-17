// Claude Code's sessions as the island sees them, from the hooks' events,
// and what the island asks the user for them. Pure: tested on its own.

import { t } from "../core/i18n.ts";

export interface CcEvent {
  event: string;
  session: string;
  cwd: string;
  tool: string;
  input: unknown;
  message: string;
  title: string;
}

export interface CcAsk extends CcEvent {
  id: number;
  kind: "permission" | "question";
}

export type SessionState = "working" | "waiting" | "done";

export interface Session {
  id: string;
  /** The project's folder name. */
  project: string;
  state: SessionState;
  /** What it is doing now ("Editando island.ts"), or what it last said. */
  doing: string;
  /** When it last changed, ms. */
  at: number;
}

export function project(cwd: string): string {
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? "Claude Code";
}

const str = (v: unknown, key: string): string => {
  const x = v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined;
  return typeof x === "string" ? x : "";
};

const file = (path: string) => path.split(/[\\/]+/).at(-1) ?? path;

const short = (s: string, n = 80) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/** A tool call in a few words. */
export function describe(tool: string, input: unknown): string {
  switch (tool) {
    case "Bash":
    case "PowerShell":
      return short(str(input, "description") || str(input, "command"));
    case "Edit":
    case "MultiEdit":
      return t("Editing {file}", { file: file(str(input, "file_path")) });
    case "Write":
      return t("Writing {file}", { file: file(str(input, "file_path")) });
    case "Read":
      return t("Reading {file}", { file: file(str(input, "file_path")) });
    case "Grep":
    case "Glob":
      return t("Searching {what}", { what: short(str(input, "pattern"), 40) });
    case "WebFetch":
      return t("Opening {what}", { what: short(str(input, "url"), 50) });
    case "WebSearch":
      return t("Searching {what}", { what: short(str(input, "query"), 40) });
    case "AskUserQuestion":
      return t("Asking you");
    case "ExitPlanMode":
      return t("Plan ready");
    case "Agent":
    case "Task":
      return short(str(input, "description")) || t("Starting an agent");
    default:
      return tool.startsWith("mcp__") ? tool.split("__").slice(1).join(" · ") : tool;
  }
}

/** The details a permission shows: the command, or the file and what changes. */
export function permissionDetail(tool: string, input: unknown): string {
  if (tool === "Bash" || tool === "PowerShell") return str(input, "command");
  if (tool === "Edit" || tool === "MultiEdit" || tool === "Write" || tool === "Read") return str(input, "file_path");
  if (tool === "WebFetch") return str(input, "url");
  try {
    return short(JSON.stringify(input ?? {}), 300);
  } catch {
    return "";
  }
}

/** The sessions after an event (newest first). Ended ones go away. */
export function apply(list: readonly Session[], e: CcEvent, now: number): Session[] {
  if (!e.session) return list.slice();
  const others = list.filter((s) => s.id !== e.session);
  if (e.event === "SessionEnd") return others;
  const prev = list.find((s) => s.id === e.session);
  const base: Session = prev ?? { id: e.session, project: project(e.cwd), state: "done", doing: "", at: now };
  let s: Session = { ...base, project: e.cwd ? project(e.cwd) : base.project, at: now };
  switch (e.event) {
    case "SessionStart":
      s = { ...s, state: "done", doing: t("Ready") };
      break;
    case "UserPromptSubmit":
      s = { ...s, state: "working", doing: short(e.message) || t("Working") };
      break;
    case "PreToolUse":
    case "PermissionRequest":
      s = { ...s, state: "working", doing: describe(e.tool, e.input) };
      break;
    case "Notification":
      s = { ...s, state: "waiting", doing: short(e.message) };
      break;
    case "Stop":
      s = { ...s, state: "done", doing: t("Finished") };
      break;
    default:
      return list.slice();
  }
  return [s, ...others].slice(0, 12);
}

export interface Question {
  question: string;
  header: string;
  multiSelect: boolean;
  options: { label: string; description: string }[];
}

/** AskUserQuestion's questions, read safely. */
export function questions(input: unknown): Question[] {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>).questions : null;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q) => ({
      question: str(q, "question"),
      header: str(q, "header"),
      multiSelect: !!(q && typeof q === "object" && (q as Record<string, unknown>).multiSelect === true),
      options: (Array.isArray((q as Record<string, unknown>)?.options) ? ((q as Record<string, unknown>).options as unknown[]) : [])
        .map((o) => ({ label: str(o, "label"), description: str(o, "description") }))
        .filter((o) => o.label),
    }))
    .filter((q) => q.question);
}

/** The answers Claude Code expects: each question's text to its choice (several joined by ", "). */
export function answers(qs: readonly Question[], picked: readonly string[][]): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (let i = 0; i < qs.length; i++) {
    const p = (picked[i] ?? []).map((s) => s.trim()).filter(Boolean);
    if (!p.length) return null;
    out[qs[i].question] = qs[i].multiSelect ? p.join(", ") : p[0];
  }
  return out;
}
