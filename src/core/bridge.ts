// The page's calls to Rust (src-tauri). Outside the app (a plain browser,
// the tests) every call answers null, so the island can be looked at and
// worked on with `npm run dev`.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Provider, Mode } from "./settings.ts";

export const IN_APP = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!IN_APP) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`[manga] ${cmd} failed`, err);
    return null;
  }
}

/** The key names in Windows' Credential Manager. */
export type SecretName = "anthropic" | "gemini";

export interface ChatRequest {
  id: string;
  provider: Provider;
  mode: Mode;
  model: string | null;
  turns: { role: "user" | "assistant"; text: string }[];
}

export const Bridge = {
  /** Sizes the island's window and puts it at the top centre of its screen. */
  layout: (width: number, height: number) => call<void>("island_layout", { width, height }),
  /** Lets the island take the keyboard (a text field) or gives it back. */
  focus: (on: boolean) => call<void>("island_focus", { on }),
  /** Saves an API key in Windows' Credential Manager. */
  secretSet: (name: SecretName, value: string) => call<boolean>("secret_set", { name, value }),
  secretHas: (name: SecretName) => call<boolean>("secret_has", { name }),
  secretClear: (name: SecretName) => call<boolean>("secret_clear", { name }),
  /** Starts an answer: it arrives as "chat-delta" events, then "chat-done". */
  chatSend: (request: ChatRequest) => call<void>("chat_send", { request }),
  chatCancel: (id: string) => call<void>("chat_cancel", { id }),
  notificationsWatch: (on: boolean) => call<void>("notifications_watch", { on }),
  /** Answers Claude Code waiting on the island. */
  ccAnswer: (id: number, answer: CcAnswer) => call<boolean>("claude_code_answer", { id, answer }),
  ccStatus: () => call<CcStatus>("claude_code_status"),
  /** Adds (or takes out) Manga's hooks in Claude Code's settings.json. */
  ccConnect: (on: boolean) => invokeOrError<CcStatus>("claude_code_connect", { on }),
  /** What plays: "play_pause" | "next" | "previous" | "seek" (position in seconds). */
  mediaControl: (action: "play_pause" | "next" | "previous" | "seek", position?: number) => call<boolean>("media_control", { action, position }),
  soundGet: () => call<Sound>("sound_get"),
  soundSet: (what: "volume" | "mute" | "mic_mute" | "app_volume" | "app_mute", value: number, pid?: number) => call<boolean>("sound_set", { what, value, pid }),
  /** How loud it plays now, 0–1. */
  soundLevel: () => call<number>("sound_level"),
  radiosGet: () => call<{ kind: "wifi" | "bluetooth"; on: boolean }[]>("radios_get"),
  radioSet: (kind: "wifi" | "bluetooth", on: boolean) => call<boolean>("radio_set", { kind, on }),
  brightnessGet: () => call<number | null>("brightness_get"),
  brightnessSet: (value: number) => call<boolean>("brightness_set", { value }),
  pipWindows: () => call<PipSource[]>("pip_windows"),
  pipOpen: (source?: number) => invokeOrError<PipSource>("pip_open", { source: source ?? null }),
  pipClose: () => call<void>("pip_close"),
  locksGet: () => call<{ caps: boolean; num: boolean; scroll: boolean }>("locks_get"),
  /** Opens a file (reveal: its folder, with it selected). */
  openPath: (path: string, reveal = false) => call<boolean>("open_path", { path, reveal }),
  downloadsFolder: () => call<string>("downloads_folder"),
  /** An app's icon, as a data: URL. */
  appIcon: (aumid: string) => call<string | null>("app_icon", { aumid }),
  /** Downloads a link to the Downloads folder (progress: "download" events). */
  downloadUrl: (url: string) => invokeOrError<string>("download_url", { url }),
};

export interface Sound {
  /** 0–1; -1 without an output device. */
  volume: number;
  muted: boolean;
  micMuted: boolean | null;
  apps: { pid: number; name: string; volume: number; muted: boolean; active: boolean }[];
}

export interface PipSource {
  id: number;
  title: string;
  app: string;
}

export type CcAnswer =
  | { choice: "allow" | "terminal" }
  | { choice: "deny"; message?: string }
  | { choice: "answers"; answers: Record<string, string> };

export interface CcStatus {
  hooks: boolean;
  listening: boolean;
  path: string;
}

/** Like call(), but the error's text comes back to show it. */
async function invokeOrError<T>(cmd: string, args?: Record<string, unknown>): Promise<{ ok: T } | { error: string }> {
  if (!IN_APP) return { error: "Só no app." };
  try {
    return { ok: await invoke<T>(cmd, args) };
  } catch (err) {
    return { error: String(err) };
  }
}

/** Listens to an event from Rust (nothing outside the app). */
export function on<T>(event: string, handler: (payload: T) => void) {
  if (!IN_APP) return;
  void listen<T>(event, (e) => handler(e.payload));
}
