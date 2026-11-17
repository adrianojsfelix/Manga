// What the island announces about the PC: lock keys, screenshots, downloads.
// Pure: tested on its own.

import { t } from "../core/i18n.ts";

export interface Locks {
  caps: boolean;
  num: boolean;
  scroll: boolean;
}

export interface Shot {
  path: string;
  name: string;
  image: string;
}

export interface Download {
  id: string;
  name: string;
  bytes: number;
  /** 0 when unknown (the browsers do not tell other apps). */
  total: number;
  speed: number;
  state: "downloading" | "done" | "cancelled";
  file: string;
}

/** The lock key that changed, and how it is now. */
export function lockChange(before: Locks, now: Locks): { key: keyof Locks; on: boolean } | null {
  for (const key of ["caps", "num", "scroll"] as (keyof Locks)[]) {
    if (before[key] !== now[key]) return { key, on: now[key] };
  }
  return null;
}

export function lockName(key: keyof Locks): string {
  return { caps: "Caps Lock", num: "Num Lock", scroll: "Scroll Lock" }[key];
}

/** "812 KB", "4,2 MB", "1,25 GB" in the user's language. */
export function size(bytes: number, lang = "pt-BR"): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = Math.max(0, bytes);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toLocaleString(lang, { maximumFractionDigits: digits })} ${units[i]}`;
}

/** 0–100, or null when the total is unknown. */
export function percent(d: Download): number | null {
  if (d.state === "done") return 100;
  if (!d.total) return null;
  return Math.min(99, Math.floor((d.bytes / d.total) * 100));
}

/** The download's line: "42% · 3,1 MB/s" or "18,4 MB · 2,2 MB/s". */
export function progressText(d: Download, lang = "pt-BR"): string {
  if (d.state === "done") return t("Done · {size}", { size: size(d.bytes, lang) });
  const p = percent(d);
  const head = p == null ? size(d.bytes, lang) : `${p}% ${t("of")} ${size(d.total, lang)}`;
  return d.speed > 0 ? `${head} · ${size(d.speed, lang)}/s` : head;
}

/** Downloads after news (by id): finished and cancelled ones leave after a while (the island's timer). */
export function merge(list: readonly Download[], news: readonly Download[]): Download[] {
  const out = list.slice();
  for (const n of news) {
    const i = out.findIndex((d) => d.id === n.id);
    if (n.state === "cancelled") {
      if (i >= 0) out.splice(i, 1);
      continue;
    }
    if (i >= 0) out[i] = n;
    else out.push(n);
  }
  return out;
}
