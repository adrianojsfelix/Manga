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
  /** The day, for the AI (empty when the person turned it off). */
  context: string;
}

export const Bridge = {
  /** Sizes the island's window and puts it at the top centre of its screen. */
  layout: (width: number, height: number) => call<void>("island_layout", { width, height }),
  /** Lets the island take the keyboard (a text field) or gives it back. */
  focus: (on: boolean) => call<void>("island_focus", { on }),
  appVersion: () => call<string>("app_version"),
  /** The newest release on GitHub when newer; null when up to date. */
  updateCheck: () => invokeOrError<Release | null>("update_check"),
  autostartGet: () => call<boolean>("autostart_get"),
  autostartSet: (on: boolean) => call<boolean>("autostart_set", { on }),
  monitors: () => call<{ index: number; name: string; width: number; height: number; primary: boolean }[]>("monitors"),
  islandMonitor: (choice: string) => call<void>("island_monitor", { choice }),
  islandVisible: (on: boolean) => call<void>("island_visible", { on }),
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
  mediaControl: (action: "play_pause" | "next" | "previous" | "seek" | "repeat", position?: number) => call<boolean>("media_control", { action, position }),
  soundGet: () => call<Sound>("sound_get"),
  soundSet: (what: "volume" | "mute" | "mic_mute" | "app_volume" | "app_mute", value: number, pid?: number) => call<boolean>("sound_set", { what, value, pid }),
  /** How loud it plays now, 0–1. */
  soundLevel: () => call<number>("sound_level"),
  radiosGet: () => call<{ kind: "wifi" | "bluetooth"; on: boolean }[]>("radios_get"),
  radioSet: (kind: "wifi" | "bluetooth", on: boolean) => call<boolean>("radio_set", { kind, on }),
  brightnessSet: (id: string, value: number) => call<boolean>("brightness_set", { id, value }),
  pipWindows: () => call<PipSource[]>("pip_windows"),
  pipOpen: (source?: number) => invokeOrError<PipSource>("pip_open", { source: source ?? null }),
  pipClose: () => call<void>("pip_close"),
  /** The playing window, live, in a rectangle of the island (CSS px). */
  mediaLive: (x: number, y: number, width: number, height: number) => invokeOrError<string>("media_live", { x, y, width, height }),
  mediaLiveOff: () => call<void>("media_live_off"),
  sysinfo: () => call<SysInfoRaw>("sysinfo"),
  brightnessList: () => call<{ id: string; name: string; value: number }[]>("brightness_list"),
  winState: () => call<WinState>("win_state"),
  winAction: (action: string) => call<boolean>("win_action", { action }),
  openUrl: (url: string) => call<boolean>("open_url", { url }),
  /** A web page's text (https), fetched by Rust. */
  fetchText: (url: string) => invokeOrError<string>("fetch_text", { url }),
  /** The user's Pinterest (logged in) in a window of its own; `path` inside the site. */
  pinterestOpen: (path?: string) => invokeOrError<void>("pinterest_open", { path: path ?? null }),
  /** Speech from the voice server on this PC, as a data: URL. */
  voiceSpeak: (base: string, voice: string, model: string, text: string) => invokeOrError<string>("voice_speak", { base, voice, model, text }),
  voiceList: (base: string) => invokeOrError<string[]>("voice_list", { base }),
  fileIcon: (path: string) => call<string | null>("file_icon", { path }),
  keyboardGet: () => call<Keyboard>("keyboard_get"),
  keyboardSet: (id: number) => call<boolean>("keyboard_set", { id }),
  appsOpen: () => call<AppWindow[]>("apps_open"),
  appWindow: (id: number, action: "activate" | "minimize" | "close") => call<boolean>("app_window", { id, action }),
  appsPinned: () => call<{ name: string; path: string }[]>("apps_pinned"),
  appLaunch: (path: string) => call<boolean>("app_launch", { path }),
  clipboardHistory: () => call<Clip[]>("clipboard_history"),
  clipboardUse: (id: number) => call<boolean>("clipboard_use", { id }),
  clipboardClear: () => call<void>("clipboard_clear"),
  clipboardWatch: (on: boolean) => call<void>("clipboard_watch", { on }),
  copyFiles: (paths: string[]) => call<boolean>("copy_files", { paths }),
  locksGet: () => call<{ caps: boolean; num: boolean; scroll: boolean }>("locks_get"),
  /** Opens a file (reveal: its folder, with it selected). */
  openPath: (path: string, reveal = false) => call<boolean>("open_path", { path, reveal }),
  downloadsFolder: () => call<string>("downloads_folder"),
  /** An app's icon, as a data: URL. */
  appIcon: (aumid: string) => call<string | null>("app_icon", { aumid }),
  /** Downloads a link to the Downloads folder (progress: "download" events). */
  downloadUrl: (url: string) => invokeOrError<string>("download_url", { url }),
  /** The alarm's card or the rest screen, in their own window. */
  popupOpen: (label: "alert" | "rest", data: unknown, width: number, height: number, place: "center" | "top" | "full") =>
    call<void>("popup_open", { label, page: `${label}.html`, data, width, height, place }),
  popupClose: (label: "alert" | "rest") => call<void>("popup_close", { label }),
};

export interface Release {
  version: string;
  notes: string;
  page: string;
  installer: string | null;
  installerName: string | null;
}

export interface Keyboard {
  layouts: { id: number; locale: string; short: string; name: string }[];
  current: number;
}

export interface AppWindow {
  id: number;
  title: string;
  app: string;
  exe: string;
  active: boolean;
  minimized: boolean;
}

export interface Clip {
  id: number;
  kind: "text" | "image" | "files";
  text: string;
  thumb: string;
  at: number;
}

export interface SysInfoRaw {
  cpu: number;
  ramUsed: number;
  ramTotal: number;
  gpu: number;
  vramUsed: number;
  vramTotal: number;
  down: number;
  up: number;
  diskUsed: number;
  diskTotal: number;
  uptime: number;
}

export interface WinState {
  dark: boolean | null;
  airplane: boolean | null;
  power: "saver" | "balanced" | "performance" | null;
  binItems: number;
  binBytes: number;
}

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
