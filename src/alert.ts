// The alarm's card: Kumo reacting big, what ended, the tone ringing until
// dismissed, and the buttons. The island opens it with what to show.

import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IN_APP } from "./core/bridge.ts";
import { playTone } from "./focus/tones.ts";
import { Canvas, el } from "./island/dom.ts";
import { Kumo, type Mood } from "./mascot/kumo.ts";

export interface AlertData {
  title: string;
  body: string;
  tone: string;
  volume: number;
  mood: Mood;
  color: string;
  repeat: boolean;
  actions: { id: string; label: string }[];
}

const data = (window as unknown as { __POPUP__?: AlertData }).__POPUP__ ?? {
  title: "Foco concluído!",
  body: "Hora de descansar: 5 minutos.",
  tone: "bell",
  volume: 0.6,
  mood: "proud",
  color: "#8b7cf6",
  repeat: false,
  actions: [
    { id: "start", label: "Começar pausa" },
    { id: "dismiss", label: "Depois" },
  ],
};

const kumo = new Kumo();
kumo.setMood(data.mood);
const face = new Canvas(150, 150, "a-kumo", (x) => kumo.draw(x, 150, 150, 92));
const root = document.getElementById("root")!;
root.style.setProperty("--accent", data.color);
const card = el("div", "a-card");
const text = el("div", "a-text");
text.append(el("h1", "", data.title), el("p", "", data.body));
const row = el("div", "a-row");
let ringing: number | null = null;
let ctx: AudioContext | null = null;

async function close(action: string) {
  if (ringing != null) window.clearInterval(ringing);
  if (IN_APP) {
    await emit("alert-action", { action });
    await getCurrentWindow().close();
  } else card.classList.add("gone");
}

data.actions.forEach((a, i) => {
  const b = el("button", i === 0 ? "a-btn main" : "a-btn", a.label);
  b.addEventListener("click", () => void close(a.id));
  row.append(b);
});
text.append(row);
card.append(face.el, text);
root.append(card);

// The tone: now, and again until a button is pressed (a minute at most).
function ring() {
  ctx ??= new AudioContext();
  void ctx.resume();
  playTone(ctx, data.tone, data.volume);
}
ring();
let rings = 1;
if (data.repeat) {
  ringing = window.setInterval(() => {
    if (++rings > 20) {
      window.clearInterval(ringing!);
      return;
    }
    ring();
  }, 3200);
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") void close("dismiss");
  if (e.key === "Enter") void close(data.actions[0]?.id ?? "dismiss");
});

function frame() {
  face.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
