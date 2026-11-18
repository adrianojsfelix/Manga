// Quick news from the PC, in the island for a moment: a lock key, a
// screenshot, a download finished. The pointer on it holds it.

import { Bridge } from "../core/bridge.ts";
import { language, t } from "../core/i18n.ts";
import { el, icon } from "../island/dom.ts";
import { I } from "../island/icons.ts";
import type { Ring } from "../focus/engine.ts";
import { lockName, size, type Download, type Locks, type Shot } from "./activity.ts";

export type HudItem =
  | { kind: "lock"; key: keyof Locks; on: boolean }
  | { kind: "shot"; shot: Shot }
  | { kind: "done"; download: Download; folder: string }
  | { kind: "ring"; ring: Ring; color: string; act: (id: string) => void }
  | { kind: "water"; text: string; drink: () => void }
  | { kind: "keyboard"; short: string; name: string }
  | { kind: "say"; text: string };

const SECONDS: Record<HudItem["kind"], number> = { lock: 1.6, shot: 6, done: 6, ring: 60, water: 12, keyboard: 1.8, say: 5 };

export class Hud {
  readonly el = el("div", "hud");
  current: HudItem | null = null;
  /** Kumo's face for a ringing alarm (the island draws it). */
  ringFace: HTMLElement | null = null;
  private timer: number | null = null;
  private hovering = false;

  constructor(private changed: () => void) {
    this.el.addEventListener("mouseenter", () => {
      // A lock key's note is too short to hold.
      if (this.current?.kind === "lock" || this.current?.kind === "keyboard") return;
      this.hovering = true;
      if (this.timer != null) window.clearTimeout(this.timer);
    });
    this.el.addEventListener("mouseleave", () => {
      this.hovering = false;
      this.arm();
    });
  }

  show(item: HudItem) {
    this.current = item;
    this.arm();
    this.changed();
  }

  private arm() {
    if (this.timer != null) window.clearTimeout(this.timer);
    if (!this.current || this.hovering) return;
    this.timer = window.setTimeout(() => {
      this.current = null;
      this.changed();
    }, SECONDS[this.current.kind] * 1000);
  }

  private action(label: string, path: string, act: () => void) {
    const b = el("button", "hud-btn");
    b.append(icon(path, 14), el("span", "", label));
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      act();
    });
    return b;
  }

  paint() {
    const h = this.current;
    this.el.replaceChildren();
    this.el.className = `hud ${h?.kind ?? ""}`;
    if (!h) return;
    if (h.kind === "lock") {
      const ic = el("span", `hud-lock${h.on ? " on" : ""}`);
      ic.append(icon(I.lock, 15));
      this.el.append(ic, el("span", "hud-lock-name", lockName(h.key)), el("span", `hud-state${h.on ? " on" : ""}`, h.on ? t("on") : t("off")));
      return;
    }
    if (h.kind === "ring") {
      const r = h.ring;
      this.el.style.setProperty("--accent", h.color);
      const text = el("div", "hud-text");
      text.append(el("b", "hud-ring-title", r.title), el("span", "", r.body));
      const row = el("div", "hud-row");
      r.actions.forEach((a, i) => {
        const b = el("button", i === 0 ? "hud-btn main" : "hud-btn", a.label);
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          this.current = null;
          h.act(a.id);
          this.changed();
        });
        row.append(b);
      });
      text.append(row);
      this.el.append(this.ringFace ?? el("span"), text);
      return;
    }
    if (h.kind === "say") {
      this.el.append(this.ringFace ?? el("span"), el("span", "hud-say", h.text));
      return;
    }
    if (h.kind === "keyboard") {
      this.el.className = "hud lock keyboard";
      this.el.append(el("span", "hud-lock on", h.short), el("span", "hud-lock-name", h.name), el("span", "hud-state on", t("Keyboard")));
      return;
    }
    if (h.kind === "water") {
      const text = el("div", "hud-text");
      text.append(el("b", "", t("Time for some water!")), el("span", "", h.text));
      const row = el("div", "hud-row");
      const yes = el("button", "hud-btn main", t("I drank a glass"));
      yes.addEventListener("click", (e) => {
        e.stopPropagation();
        this.current = null;
        h.drink();
        this.changed();
      });
      const later = el("button", "hud-btn", t("Later"));
      later.addEventListener("click", (e) => {
        e.stopPropagation();
        this.current = null;
        this.changed();
      });
      row.append(yes, later);
      text.append(row);
      this.el.append(this.ringFace ?? el("span"), text);
      return;
    }
    if (h.kind === "shot") {
      const thumb = el("span", "hud-thumb");
      if (h.shot.image) thumb.style.backgroundImage = `url("${h.shot.image}")`;
      else thumb.append(icon(I.camera, 22));
      const text = el("div", "hud-text");
      text.append(el("b", "", t("Screenshot saved")), el("span", "", h.shot.name));
      const row = el("div", "hud-row");
      row.append(this.action(t("Open"), I.windows, () => void Bridge.openPath(h.shot.path)), this.action(t("Folder"), I.folder, () => void Bridge.openPath(h.shot.path, true)));
      text.append(row);
      this.el.append(thumb, text);
      return;
    }
    const d = h.download;
    const path = h.folder ? `${h.folder}\\${d.file}` : d.file;
    const ok = el("span", "hud-check");
    ok.append(icon(I.check, 22));
    const text = el("div", "hud-text");
    text.append(el("b", "", t("Download finished")), el("span", "", `${d.name} · ${size(d.bytes, language())}`));
    const row = el("div", "hud-row");
    row.append(this.action(t("Open"), I.windows, () => void Bridge.openPath(path)), this.action(t("Folder"), I.folder, () => void Bridge.openPath(path, true)));
    text.append(row);
    this.el.append(ok, text);
  }
}
