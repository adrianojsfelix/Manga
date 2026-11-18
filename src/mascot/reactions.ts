// How Manga feels about what is going on, and what he says about it now and
// then. Pure: tested on its own.

import type { Mood } from "./kumo.ts";

export interface Situation {
  hour: number;
  /** 0–1, or null without a battery. */
  battery: number | null;
  charging: boolean;
  /** 0–100, or null when not read. */
  cpu: number | null;
  focusing: boolean;
  onBreak: boolean;
  /** Water and pomodoros of the day reached. */
  goalReached: boolean;
}

/** His mood at rest (the chat and alarms flash their own over it). */
export function restMood(s: Situation): Mood {
  if (s.battery != null && s.battery < 0.15 && !s.charging) return "sad";
  if (s.cpu != null && s.cpu > 92) return "dizzy";
  if (s.focusing) return "working";
  if (s.goalReached) return "proud";
  if (s.onBreak) return "happy";
  if (s.hour >= 23 || s.hour < 6) return "sleepy";
  return "idle";
}

/** A short line for a change of mood, or null (he does not comment everything). */
export function remark(before: Mood, now: Mood): string | null {
  if (before === now) return null;
  switch (now) {
    case "sad":
      return "Bateria fraca… liga o carregador?";
    case "dizzy":
      return "Ufa, o processador está a mil!";
    case "proud":
      return "Meta do dia batida! 🎉";
    case "sleepy":
      return before === "idle" ? "Já está tarde… não esquece de descansar." : null;
    default:
      return null;
  }
}
