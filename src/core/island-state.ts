// What the island is doing: how big it is now, and why. A small state
// machine, pure and tested: the pointer, clicks, alerts and the timers drive it.
//
// At rest the island shows the size the user picked (small or medium). The
// pointer resting on it peeks to medium; a click opens it (extended) on a
// page; leaving it folds back after a moment, unless something holds it open
// (typing, a card waiting for an answer, the user's pin).

import type { IslandSize } from "./geometry.ts";

export type Page = "home" | "assistant" | "media" | "focus" | "controls" | "notes" | "settings" | "inbox" | "system" | "tools" | "today";

export interface IslandState {
  size: IslandSize;
  /** The size it rests at, from the settings. */
  rest: Rest;
  page: Page;
  /** Kept open: the pin, typing, a card that needs an answer. */
  held: boolean;
  pointerInside: boolean;
}

export type Rest = "small" | "medium" | "bar" | "wide";

export type IslandEvent =
  | { type: "enter" }
  | { type: "leave" }
  | { type: "click" }
  | { type: "open"; page: Page }
  | { type: "fold" }
  | { type: "hold"; on: boolean }
  | { type: "rest"; size: Rest };

export const INITIAL: IslandState = { size: "small", rest: "small", page: "home", held: false, pointerInside: false };

export function next(s: IslandState, e: IslandEvent): IslandState {
  switch (e.type) {
    case "enter":
      // Resting small, the pointer peeks to medium; otherwise nothing changes.
      return { ...s, pointerInside: true, size: s.size === "small" ? "medium" : s.size };
    case "leave":
      if (s.held || s.size === "extended") return { ...s, pointerInside: false };
      return { ...s, pointerInside: false, size: s.rest };
    case "click":
      return s.size === "extended" ? s : { ...s, size: "extended" };
    case "open":
      return { ...s, size: "extended", page: e.page };
    case "fold":
      if (s.held) return s;
      return { ...s, size: s.pointerInside && s.rest === "small" ? "medium" : s.rest };
    case "hold":
      return { ...s, held: e.on };
    case "rest":
      return { ...s, rest: e.size, size: s.size === "extended" ? "extended" : e.size };
  }
}

/** How long the island stays open after the pointer leaves, in ms. */
export const FOLD_AFTER_MS = 1200;
