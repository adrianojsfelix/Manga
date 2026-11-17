// The page's calls to Rust (src-tauri). Outside the app (a plain browser,
// the tests) every call answers null, so the island can be looked at and
// worked on with `npm run dev`.

import { invoke } from "@tauri-apps/api/core";

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

export const Bridge = {
  /** Sizes the island's window and puts it at the top centre of its screen. */
  layout: (width: number, height: number) => call<void>("island_layout", { width, height }),
  /** Lets the island take the keyboard (a text field) or gives it back. */
  focus: (on: boolean) => call<void>("island_focus", { on }),
};
