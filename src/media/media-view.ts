// The media page: the cover, what plays and from where, the time, the
// buttons, the volume, and picture-in-picture.

import { Bridge, IN_APP } from "../core/bridge.ts";
import { t } from "../core/i18n.ts";
import { el, icon } from "../island/dom.ts";
import { I } from "../island/icons.ts";
import { clock, positionNow, subtitle, type Media } from "./media.ts";

export class MediaView {
  readonly el = el("div", "media");
  private bar = el("div", "m-bar");
  private fill = el("div", "m-fill");
  private at = el("span", "m-time");
  private end = el("span", "m-time");
  private note = el("div", "m-note");

  /** The user wants the video live in the cover. */
  liveWanted = false;
  private cover: HTMLElement | null = null;

  constructor(private media: () => { m: Media | null; readAt: number }) {}

  coverRect(): DOMRect | null {
    return this.cover?.isConnected ? this.cover.getBoundingClientRect() : null;
  }

  liveFailed(why: string) {
    this.liveWanted = false;
    this.note.textContent = why;
    this.paint();
  }

  paint() {
    const { m } = this.media();
    this.el.replaceChildren();
    if (!m) {
      const empty = el("div", "m-empty");
      empty.append(el("b", "", t("Nothing playing")), el("span", "", t("Play something in any app — Spotify, YouTube, Netflix — and it shows here.")));
      this.el.append(empty);
      return;
    }
    const cover = el("div", `m-cover${this.liveWanted ? " live" : ""}`);
    this.cover = cover;
    if (this.liveWanted) cover.append(el("span", "m-live-tag", t("LIVE")));
    else if (m.cover) cover.style.backgroundImage = `url("${m.cover}")`;
    else cover.append(icon(I.play, 36));

    const info = el("div", "m-info");
    info.append(el("div", "m-app", m.app.toUpperCase()), el("div", "m-title", m.title), el("div", "m-sub", subtitle(m) || m.album));

    this.bar.replaceChildren(this.fill);
    this.bar.classList.toggle("seek", m.canSeek);
    this.bar.onclick = (e) => {
      e.stopPropagation();
      if (!m.canSeek || m.duration <= 0) return;
      const r = this.bar.getBoundingClientRect();
      void Bridge.mediaControl("seek", ((e.clientX - r.left) / r.width) * m.duration);
    };
    const time = el("div", "m-timeline");
    time.append(this.at, this.bar, this.end);
    if (m.duration <= 0) time.classList.add("live");

    const btn = (path: string, title: string, cls: string, act: () => void, size = 18) => {
      const b = el("button", `m-btn ${cls}`);
      b.title = title;
      b.append(icon(path, size));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        act();
      });
      return b;
    };
    const row = el("div", "m-row");
    row.append(
      btn(I.prev, t("Previous"), "", () => void Bridge.mediaControl("previous")),
      btn(m.playing ? I.pause : I.play, m.playing ? t("Pause") : t("Play"), "main", () => void Bridge.mediaControl("play_pause"), 20),
      btn(I.next, t("Next"), "", () => void Bridge.mediaControl("next")),
      el("span", "m-gap"),
      btn(I.windows, this.liveWanted ? t("Show the cover") : t("Watch here"), this.liveWanted ? "on" : "", () => {
        if (!IN_APP) {
          this.note.textContent = t("The live video shows in the app.");
          return;
        }
        this.liveWanted = !this.liveWanted;
        this.paint();
      }),
      btn(I.pip, t("Picture-in-picture"), "", () => void this.pip()),
    );
    info.append(time, row, this.note);
    this.el.append(cover, info);
    this.frame();
  }

  private async pip() {
    if (!IN_APP) {
      this.note.textContent = t("Picture-in-picture opens in the app.");
      return;
    }
    const r = await Bridge.pipOpen();
    this.note.textContent = "error" in r ? r.error : "";
  }

  /** The time, every frame. */
  frame() {
    const { m, readAt } = this.media();
    if (!m) return;
    const p = positionNow(m, readAt, Date.now());
    this.at.textContent = clock(p);
    this.end.textContent = m.duration > 0 ? clock(m.duration) : "";
    this.fill.style.width = m.duration > 0 ? `${(p / m.duration) * 100}%` : "0%";
  }
}
