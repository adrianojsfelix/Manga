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
};

/** Listens to an event from Rust (nothing outside the app). */
export function on<T>(event: string, handler: (payload: T) => void) {
  if (!IN_APP) return;
  void listen<T>(event, (e) => handler(e.payload));
}
