// The control center: Wi-Fi, Bluetooth, Manga's do-not-disturb and the
// microphone; the brightness and the volume; each app's volume.

import { Bridge, IN_APP, type Sound } from "../core/bridge.ts";
import { t } from "../core/i18n.ts";
import { el, icon } from "../island/dom.ts";
import { I } from "../island/icons.ts";

type Radio = { kind: "wifi" | "bluetooth"; on: boolean };

/** Calls at most every `ms`, the last value always sent. */
function throttle(ms: number, f: (v: number) => void) {
  let last = 0;
  let timer: number | null = null;
  let pending = 0;
  return (v: number) => {
    pending = v;
    const wait = last + ms - Date.now();
    if (wait <= 0) {
      last = Date.now();
      f(v);
    } else if (timer == null) {
      timer = window.setTimeout(() => {
        timer = null;
        last = Date.now();
        f(pending);
      }, wait);
    }
  };
}

// What the browser preview shows (no Windows there).
const SAMPLE: Sound = {
  volume: 0.62,
  muted: false,
  micMuted: false,
  apps: [
    { pid: 1, name: "Spotify", volume: 0.8, muted: false, active: true },
    { pid: 2, name: "Chrome", volume: 1, muted: false, active: true },
    { pid: 3, name: "Discord", volume: 0.5, muted: true, active: false },
  ],
};

export class ControlsView {
  readonly el = el("div", "controls");
  private sound: Sound | null = null;
  private radios: Radio[] = [];
  private brightness: number | null = null;
  private timer: number | null = null;
  private dragging = false;

  constructor(
    private quiet: () => boolean,
    private setQuiet: (on: boolean) => void,
  ) {}

  /** Reads everything again; while the page is open, the sound every few seconds. */
  async open() {
    this.paint();
    await this.read(true);
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.read(false), 3000);
  }

  close() {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private async read(all: boolean) {
    if (this.dragging) return;
    if (!IN_APP) {
      this.sound ??= structuredClone(SAMPLE);
      if (all) {
        this.radios = [
          { kind: "wifi", on: true },
          { kind: "bluetooth", on: false },
        ];
        this.brightness = 70;
      }
      this.paint();
      return;
    }
    const [sound, radios, brightness] = await Promise.all([Bridge.soundGet(), all ? Bridge.radiosGet() : null, all ? Bridge.brightnessGet() : undefined]);
    this.sound = sound;
    if (radios) this.radios = radios;
    if (brightness !== undefined) this.brightness = brightness;
    this.paint();
  }

  private tile(path: string, label: string, on: boolean, act: () => void, disabled = false) {
    const b = el("button", `tile${on ? " on" : ""}`);
    b.disabled = disabled;
    b.append(icon(path, 18), el("span", "", label));
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      act();
    });
    return b;
  }

  private slider(path: string, value: number, set: (v: number) => void, cls = "") {
    const row = el("div", `ctl-slider ${cls}`);
    const input = el("input");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.value = String(Math.round(value * 100));
    input.style.setProperty("--v", `${input.value}%`);
    const send = throttle(120, (v) => set(v / 100));
    input.addEventListener("pointerdown", () => (this.dragging = true));
    input.addEventListener("pointerup", () => (this.dragging = false));
    input.addEventListener("input", () => {
      input.style.setProperty("--v", `${input.value}%`);
      send(Number(input.value));
    });
    input.addEventListener("click", (e) => e.stopPropagation());
    row.append(icon(path, 16), input);
    return row;
  }

  paint() {
    if (this.dragging) return;
    this.el.replaceChildren();
    const s = this.sound;
    const left = el("div", "ctl-left");
    const tiles = el("div", "tiles");
    const radio = (kind: Radio["kind"]) => this.radios.find((r) => r.kind === kind);
    const wifi = radio("wifi");
    const bt = radio("bluetooth");
    const flip = (r: Radio | undefined) => async () => {
      if (!r) return;
      r.on = !r.on;
      this.paint();
      if (IN_APP && !(await Bridge.radioSet(r.kind, r.on))) r.on = !r.on;
      this.paint();
    };
    tiles.append(
      this.tile(I.wifi, "Wi-Fi", wifi?.on ?? false, flip(wifi), !wifi),
      this.tile(I.bluetooth, "Bluetooth", bt?.on ?? false, flip(bt), !bt),
      this.tile(I.moon, t("Do not disturb"), this.quiet(), () => {
        this.setQuiet(!this.quiet());
        this.paint();
      }),
      this.tile(
        s?.micMuted ? I.micOff : I.mic,
        s?.micMuted ? t("Mic off") : t("Mic on"),
        s?.micMuted === false,
        () => {
          if (!s || s.micMuted == null) return;
          s.micMuted = !s.micMuted;
          void Bridge.soundSet("mic_mute", s.micMuted ? 1 : 0);
          this.paint();
        },
        s?.micMuted == null,
      ),
    );
    left.append(tiles);
    if (this.brightness != null) left.append(this.slider(I.sun, this.brightness / 100, (v) => void Bridge.brightnessSet(Math.round(v * 100))));
    if (s && s.volume >= 0) {
      const vol = this.slider(s.muted ? I.muted : I.volume, s.volume, (v) => {
        s.volume = v;
        void Bridge.soundSet("volume", v);
      });
      vol.querySelector("svg")!.addEventListener("click", (e) => {
        e.stopPropagation();
        s.muted = !s.muted;
        void Bridge.soundSet("mute", s.muted ? 1 : 0);
        this.paint();
      });
      vol.classList.add("mutable");
      left.append(vol);
    }

    const apps = el("div", "ctl-apps");
    apps.append(el("div", "ctl-title", t("Volume by app")));
    if (!s?.apps.length) apps.append(el("p", "set-note", t("No app is making sound.")));
    for (const a of s?.apps ?? []) {
      const row = el("div", `app-vol${a.active ? " active" : ""}`);
      const mute = el("button", "app-mute");
      mute.title = a.muted ? t("Unmute") : t("Mute");
      mute.append(icon(a.muted ? I.muted : I.volume, 14));
      mute.addEventListener("click", (e) => {
        e.stopPropagation();
        a.muted = !a.muted;
        void Bridge.soundSet("app_mute", a.muted ? 1 : 0, a.pid);
        this.paint();
      });
      const sl = this.slider(
        I.volume,
        a.volume,
        (v) => {
          a.volume = v;
          void Bridge.soundSet("app_volume", v, a.pid);
        },
        "bare",
      );
      sl.querySelector("svg")?.remove();
      row.append(el("span", "app-name", a.name), sl, mute);
      apps.append(row);
    }
    this.el.append(left, apps);
  }
}
