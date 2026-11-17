// Windows' notifications as the island shows them: which to show, the recent
// ones kept for the list. Pure: Rust reads them, the island draws them.

import { t } from "../core/i18n.ts";

export interface Notice {
  id: number;
  app: string;
  /** The app's id in Windows (for its icon); empty for the island's own. */
  aumid?: string;
  title: string;
  body: string;
  /** Milliseconds since 1970. */
  at: number;
}

/** How many the list keeps. */
export const KEEP = 30;

export function shows(n: Notice, ignored: readonly string[]): boolean {
  if (!n.title && !n.body) return false;
  const app = n.app.toLowerCase();
  return !ignored.some((a) => a.toLowerCase() === app);
}

/** Adds a notice to the recent ones (newest first), once each. */
export function remember(list: readonly Notice[], n: Notice): Notice[] {
  return [n, ...list.filter((o) => o.id !== n.id)].slice(0, KEEP);
}

/** "agora", "5 min", "2 h", or the date: how long ago, short. */
export function ago(at: number, now: number, lang: string): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  const pt = lang.startsWith("pt");
  if (s < 60) return pt ? "agora" : "now";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h`;
  return new Date(at).toLocaleDateString(lang, { day: "numeric", month: "short" });
}

/** What Kumo says when one arrives (several waiting: how many). */
export function announce(app: string, waiting: number, seed: number): string {
  if (waiting > 1) return t("{n} new notifications!", { n: waiting });
  const lines = ["New from {app}!", "Look, {app}!", "{app} is calling you!", "Something from {app}!"];
  return t(lines[Math.abs(Math.floor(seed)) % lines.length], { app });
}

/** A steady colour for an app without an icon. */
export function appColor(app: string): string {
  let h = 0;
  for (const c of app) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 48%)`;
}
