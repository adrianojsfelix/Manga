// The rest screen in a pomodoro break: the whole screen dimmed, Kumo
// resting, the time left, a tip, and (if allowed) a button to skip.

import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IN_APP } from "./core/bridge.ts";
import { t } from "./core/i18n.ts";
import { clock } from "./focus/timer.ts";
import { Canvas, el } from "./island/dom.ts";
import { Kumo } from "./mascot/kumo.ts";

interface RestData {
  endsAt: number;
  long: boolean;
  skip: boolean;
}

const data = (window as unknown as { __POPUP__?: RestData }).__POPUP__ ?? { endsAt: Date.now() + 5 * 60_000, long: false, skip: true };

const TIPS = [
  "Look at something far away for 20 seconds.",
  "Stand up and stretch your shoulders.",
  "Drink a glass of water.",
  "Breathe in for 4, hold for 4, out for 4.",
  "Rest your eyes: close them for a moment.",
  "Walk around a little.",
];

const kumo = new Kumo();
kumo.setMood("sleepy");
const face = new Canvas(180, 180, "r-kumo", (x) => kumo.draw(x, 180, 180, 110));
const root = document.getElementById("root")!;
const time = el("div", "r-time");
const tip = el("p", "r-tip", t(TIPS[Math.floor(Date.now() / 60000) % TIPS.length]));
const box = el("div", "r-box");
box.append(face.el, el("h1", "", data.long ? t("Long break") : t("Short break")), time, tip);
if (data.skip) {
  const b = el("button", "a-btn", t("Skip break"));
  b.addEventListener("click", async () => {
    if (IN_APP) {
      await emit("rest-action", { action: "skip" });
      await getCurrentWindow().close();
    }
  });
  box.append(b);
}
root.append(box);

let tipAt = Date.now();
function frame() {
  const left = data.endsAt - Date.now();
  time.textContent = clock(left);
  face.draw();
  if (Date.now() - tipAt > 30_000) {
    tipAt = Date.now();
    tip.textContent = t(TIPS[Math.floor(Math.random() * TIPS.length)]);
  }
  if (left <= 0 && IN_APP) void getCurrentWindow().close();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
