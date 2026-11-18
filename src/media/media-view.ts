// The media page: the cover, what plays and from where, the time, the
// buttons, the volume, and picture-in-picture.

import { Bridge, IN_APP } from "../core/bridge.ts";
import { t } from "../core/i18n.ts";
import { el, icon } from "../island/dom.ts";
import { I } from "../island/icons.ts";
import { appOf, clock, positionNow, subtitle, type Media } from "./media.ts";

type AppVol = { pid: number; name: string; volume: number; muted: boolean };

export class MediaView {
  readonly el = el("div", "media");
  private bar = el("div", "m-bar");
  private fill = el("div", "m-fill");
  private at = el("span", "m-time");
  private end = el("span", "m-time");
  private note = el("div", "m-note");
  /** The playing app's volume (or the speakers' when it is not found). */
  private vol: { app: AppVol | null; master: number } | null = null;
  private volFor = "";
  private repeatLocal: Media["repeat"] = "none";

  private async readVolume(app: string) {
    this.volFor = app;
    if (!IN_APP) {
      this.vol = { app: { pid: 1, name: app, volume: 0.8, muted: false }, master: 0.6 };
    } else {
      const s = await Bridge.soundGet();
      this.vol = s ? { app: appOf(s.apps, app), master: Math.max(0, s.volume) } : null;
    }
    this.paint();
  }

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
    // Repeat: off → the whole list → this one → off.
    const repeat = IN_APP ? (m.repeat ?? "none") : this.repeatLocal;
    const rep = btn(I.repeat, repeat === "track" ? t("Repeating this one") : repeat === "list" ? t("Repeating the list") : t("Repeat"), `repeat ${repeat}`, () => {
      if (!IN_APP) {
        this.repeatLocal = repeat === "none" ? "list" : repeat === "list" ? "track" : "none";
        this.paint();
        return;
      }
      void Bridge.mediaControl("repeat");
    }, 16);
    if (IN_APP && m.canRepeat === false) rep.disabled = true;
    if (repeat === "track") rep.append(el("i", "rep-one", "1"));

    // The volume of the app that plays.
    if (this.volFor !== m.app) void this.readVolume(m.app);
    const v = this.vol;
    const level = v ? (v.app ? v.app.volume : v.master) : 0.5;
    const volume = el("label", "m-vol");
    volume.title = v?.app ? t("Volume of {app}", { app: v.app.name }) : t("Volume");
    const range = el("input");
    range.type = "range";
    range.min = "0";
    range.max = "100";
    range.value = String(Math.round(level * 100));
    range.style.setProperty("--v", `${range.value}%`);
    range.addEventListener("click", (e) => e.stopPropagation());
    range.addEventListener("input", () => {
      range.style.setProperty("--v", `${range.value}%`);
      const x = Number(range.value) / 100;
      if (!v) return;
      if (v.app) {
        v.app.volume = x;
        void Bridge.soundSet("app_volume", x, v.app.pid);
      } else {
        v.master = x;
        void Bridge.soundSet("volume", x);
      }
    });
    volume.append(icon(I.volume, 15), range);

    row.append(
      rep,
      btn(I.prev, t("Previous"), "", () => void Bridge.mediaControl("previous")),
      btn(m.playing ? I.pause : I.play, m.playing ? t("Pause") : t("Play"), "main", () => void Bridge.mediaControl("play_pause"), 20),
      btn(I.next, t("Next"), "", () => void Bridge.mediaControl("next")),
      volume,
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
