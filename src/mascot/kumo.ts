// Kumo, Manga's assistant: a round little ball with big anime eyes and an
// ahoge — the stray strand of hair manga characters have — that shows how he
// feels: it sways at rest, stands up in surprise, curls into a "?" when he
// wonders, droops when he is down and zigzags when he is cross. Around him,
// the marks manga draws: sparkles, a sweat drop, the anger vein, "!", "z".
//
// Drawn in code on a canvas, sized by `size` (the ball's diameter). `faceOf`
// says what each mood wears; it is pure and tested.

export type Mood =
  | "idle" | "happy" | "love" | "surprised" | "angry" | "sad" | "sleepy"
  | "thinking" | "working" | "alert" | "question" | "proud" | "dizzy";

export type Eyes = "open" | "smile" | "closed" | "wide" | "heart" | "star" | "angry" | "sad" | "spiral" | "look";
export type Mouth = "none" | "smile" | "open" | "o" | "wavy" | "flat" | "cat" | "fang";
export type Ahoge = "sway" | "bounce" | "up" | "curl" | "droop" | "zigzag" | "limp";
export type Mark = "sparkle" | "sweat" | "vein" | "bang" | "z" | "heart" | "dots";

export interface Face {
  eyes: Eyes;
  mouth: Mouth;
  ahoge: Ahoge;
  marks: readonly Mark[];
  blush: number;
}

export function faceOf(mood: Mood): Face {
  switch (mood) {
    case "happy": return { eyes: "smile", mouth: "open", ahoge: "bounce", marks: ["sparkle"], blush: 0.7 };
    case "love": return { eyes: "heart", mouth: "smile", ahoge: "bounce", marks: ["heart"], blush: 1 };
    case "surprised": return { eyes: "wide", mouth: "o", ahoge: "up", marks: ["bang"], blush: 0 };
    case "angry": return { eyes: "angry", mouth: "fang", ahoge: "zigzag", marks: ["vein"], blush: 0 };
    case "sad": return { eyes: "sad", mouth: "wavy", ahoge: "droop", marks: ["sweat"], blush: 0 };
    case "sleepy": return { eyes: "closed", mouth: "none", ahoge: "limp", marks: ["z"], blush: 0.2 };
    case "thinking": return { eyes: "look", mouth: "flat", ahoge: "curl", marks: ["dots"], blush: 0 };
    case "working": return { eyes: "look", mouth: "none", ahoge: "sway", marks: ["dots"], blush: 0 };
    case "alert": return { eyes: "wide", mouth: "open", ahoge: "up", marks: ["bang"], blush: 0 };
    case "question": return { eyes: "open", mouth: "o", ahoge: "curl", marks: [], blush: 0 };
    case "proud": return { eyes: "star", mouth: "cat", ahoge: "bounce", marks: ["sparkle"], blush: 0.5 };
    case "dizzy": return { eyes: "spiral", mouth: "wavy", ahoge: "zigzag", marks: [], blush: 0 };
    default: return { eyes: "open", mouth: "none", ahoge: "sway", marks: [], blush: 0.25 };
  }
}

const INK = "#1c1626";
const RED = "#f4505e";

export class Kumo {
  mood: Mood = "idle";
  /** Where he looks, −1…1 each way (the pointer). */
  lookX = 0;
  lookY = 0;
  private moodSince = now();
  private nextBlink = now() + 2;
  private blinkUntil = 0;
  /** A short emote over the mood (a poke, a cuddle), until when. */
  private emote: { mood: Mood; until: number } | null = null;

  setMood(m: Mood) {
    if (m === this.mood) return;
    this.mood = m;
    this.moodSince = now();
  }

  /** A mood for a moment, then back to the one he had. */
  flash(m: Mood, seconds = 1.6) {
    this.emote = { mood: m, until: now() + seconds };
    this.moodSince = now();
  }

  get current(): Mood {
    if (this.emote && this.emote.until > now()) return this.emote.mood;
    this.emote = null;
    return this.mood;
  }

  /** True while something moves by itself (he is always alive a little). */
  get animating(): boolean {
    return true;
  }

  /** Draws him centred in a `w`×`h` area; the ball is `size` across. */
  draw(x: CanvasRenderingContext2D, w: number, h: number, size: number) {
    const t = now();
    const mood = this.current;
    const f = faceOf(mood);
    const R = size / 2;
    const age = t - this.moodSince;
    // A breath, and a hop for the happy moods.
    const hop = f.ahoge === "bounce" ? Math.abs(Math.sin(t * 6)) * R * 0.12 : 0;
    const breathe = 1 + Math.sin(t * 2.2) * 0.015;
    const cx = w / 2;
    const cy = h / 2 + R * 0.12 - hop;

    if (t > this.nextBlink) {
      this.blinkUntil = t + 0.12;
      this.nextBlink = t + 2.5 + Math.random() * 3;
    }
    const blinking = t < this.blinkUntil;

    x.save();
    x.translate(cx, cy);
    x.scale(breathe, 1 / breathe);
    drawAhoge(x, R, f.ahoge, t, age);
    drawBody(x, R);
    drawBlush(x, R, f.blush);
    drawEyes(x, R, blinking && (f.eyes === "open" || f.eyes === "look") ? "closed" : f.eyes, this.lookX, this.lookY, t, mood);
    drawMouth(x, R, f.mouth, t);
    x.restore();

    x.save();
    x.translate(cx, cy);
    for (const m of f.marks) drawMark(x, R, m, t, age);
    x.restore();
  }
}

function now(): number {
  return performance.now() / 1000;
}

// ── The body ──────────────────────────────────────────────────────────────────

function drawBody(x: CanvasRenderingContext2D, R: number) {
  const g = x.createRadialGradient(-R * 0.35, -R * 0.45, R * 0.1, 0, 0, R * 1.05);
  g.addColorStop(0, "#fffdfb");
  g.addColorStop(0.65, "#f3eef8");
  g.addColorStop(1, "#d9d0ea");
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, R, 0, Math.PI * 2);
  x.fill();
  // A soft line round him, so he reads on a white page too.
  x.strokeStyle = "rgba(60,40,90,0.18)";
  x.lineWidth = Math.max(1, R * 0.04);
  x.stroke();
  // The shine.
  x.fillStyle = "rgba(255,255,255,0.75)";
  x.beginPath();
  x.ellipse(-R * 0.42, -R * 0.5, R * 0.18, R * 0.1, -0.6, 0, Math.PI * 2);
  x.fill();
}

function drawBlush(x: CanvasRenderingContext2D, R: number, amount: number) {
  if (amount <= 0.01) return;
  x.fillStyle = `rgba(255,120,160,${0.45 * amount})`;
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(s * R * 0.56, R * 0.22, R * 0.17, R * 0.09, 0, 0, Math.PI * 2);
    x.fill();
  }
  if (amount > 0.6) {
    // Hatching over the cheeks, as manga blushes.
    x.strokeStyle = "rgba(240,80,130,0.6)";
    x.lineWidth = R * 0.03;
    x.lineCap = "round";
    for (const s of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        const px = s * R * 0.56 + i * R * 0.07;
        x.beginPath();
        x.moveTo(px + R * 0.03, R * 0.16);
        x.lineTo(px - R * 0.03, R * 0.28);
        x.stroke();
      }
    }
  }
}

// ── The ahoge ─────────────────────────────────────────────────────────────────

function drawAhoge(x: CanvasRenderingContext2D, R: number, kind: Ahoge, t: number, age: number) {
  x.save();
  x.translate(R * 0.08, -R * 0.96);
  x.strokeStyle = "#cfc3e6";
  x.lineWidth = R * 0.11;
  x.lineCap = "round";
  x.lineJoin = "round";
  const L = R * 0.62;
  x.beginPath();
  x.moveTo(0, 0);
  switch (kind) {
    case "up": {
      const shake = Math.sin(t * 30) * R * 0.02 * Math.max(0, 1 - age * 2);
      x.lineTo(shake, -L * 1.05);
      break;
    }
    case "curl": {
      // A question mark: up, round to the right and down into a hook.
      x.quadraticCurveTo(-R * 0.05, -L * 0.6, R * 0.18, -L * 0.85);
      x.arc(R * 0.18, -L * 0.85 + R * 0.18, R * 0.18, -Math.PI / 2, Math.PI * 0.55);
      break;
    }
    case "droop":
      x.quadraticCurveTo(R * 0.12, -L * 0.6, R * 0.42, -L * 0.15);
      break;
    case "limp":
      x.quadraticCurveTo(R * 0.25, -L * 0.45, R * 0.5, -L * 0.25 + Math.sin(t * 1.5) * R * 0.03);
      break;
    case "zigzag": {
      const j = Math.sin(t * 25) * R * 0.02;
      x.lineTo(R * 0.12 + j, -L * 0.3);
      x.lineTo(-R * 0.1 + j, -L * 0.6);
      x.lineTo(R * 0.12 + j, -L * 0.9);
      break;
    }
    case "bounce": {
      const s = Math.sin(t * 12) * R * 0.18;
      x.quadraticCurveTo(s, -L * 0.55, R * 0.12 + s * 0.6, -L);
      break;
    }
    default: {
      const s = Math.sin(t * 2.4) * R * 0.1;
      x.quadraticCurveTo(-R * 0.12 + s * 0.3, -L * 0.55, R * 0.2 + s, -L * 0.95);
    }
  }
  x.stroke();
  x.restore();
}

// ── The eyes ──────────────────────────────────────────────────────────────────

function drawEyes(x: CanvasRenderingContext2D, R: number, eyes: Eyes, lx: number, ly: number, t: number, mood: Mood) {
  const gap = R * 0.36;
  const ey = -R * 0.05;
  const ew = R * 0.2;
  const eh = R * 0.3;
  // He looks where the pointer is (or aside, thinking).
  const look = eyes === "look" ? { x: 0.7 + Math.sin(t * 0.8) * 0.2, y: -0.4 } : { x: lx, y: ly };
  const ox = look.x * R * 0.09;
  const oy = look.y * R * 0.06;
  x.fillStyle = INK;
  x.strokeStyle = INK;
  x.lineCap = "round";
  for (const s of [-1, 1]) {
    const px = s * gap + ox;
    const py = ey + oy;
    x.save();
    x.translate(px, py);
    switch (eyes) {
      case "smile":
        x.lineWidth = R * 0.08;
        x.beginPath();
        x.arc(0, eh * 0.2, ew * 0.9, Math.PI * 1.15, Math.PI * 1.85);
        x.stroke();
        break;
      case "closed":
        x.lineWidth = R * 0.07;
        x.beginPath();
        x.arc(0, -eh * 0.1, ew * 0.85, Math.PI * 0.15, Math.PI * 0.85);
        x.stroke();
        break;
      case "wide":
        x.fillStyle = "#fff";
        x.lineWidth = R * 0.05;
        x.beginPath();
        x.arc(0, 0, ew * 1.1, 0, Math.PI * 2);
        x.fill();
        x.stroke();
        x.fillStyle = INK;
        x.beginPath();
        x.arc(Math.sin(t * 30) * R * 0.01, 0, ew * 0.38, 0, Math.PI * 2);
        x.fill();
        break;
      case "heart":
        x.fillStyle = RED;
        x.beginPath();
        x.moveTo(0, ew * 0.9);
        x.bezierCurveTo(-ew * 1.4, -ew * 0.1, -ew * 0.6, -ew * 1.2, 0, -ew * 0.35);
        x.bezierCurveTo(ew * 0.6, -ew * 1.2, ew * 1.4, -ew * 0.1, 0, ew * 0.9);
        x.fill();
        break;
      case "star":
        x.fillStyle = "#f7b32b";
        x.rotate(t * 1.2 * s);
        x.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? ew * 0.45 : ew * 1.05;
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        x.closePath();
        x.fill();
        break;
      case "spiral":
        x.lineWidth = R * 0.04;
        x.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.25) {
          const r = ew * 0.1 + a * ew * 0.075;
          const aa = a + t * 8 * s;
          x.lineTo(Math.cos(aa) * r, Math.sin(aa) * r);
        }
        x.stroke();
        break;
      default: {
        // Open (also angry, sad, look): a tall rounded eye with two shines.
        x.beginPath();
        x.ellipse(0, 0, ew * 0.62, eh * 0.62, 0, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = "#fff";
        x.beginPath();
        x.arc(ew * 0.18, -eh * 0.22, ew * 0.22, 0, Math.PI * 2);
        x.fill();
        x.beginPath();
        x.arc(-ew * 0.16, eh * 0.2, ew * 0.1, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = INK;
        if (eyes === "angry" || eyes === "sad") {
          // The brow: inner end down when cross, up when sad.
          x.lineWidth = R * 0.06;
          const inner = eyes === "angry" ? -eh * 0.55 : -eh * 0.95;
          const outer = eyes === "angry" ? -eh * 0.95 : -eh * 0.65;
          x.beginPath();
          x.moveTo(-s * ew * 0.75, inner);
          x.lineTo(s * ew * 0.75, outer);
          x.stroke();
        }
      }
    }
    x.restore();
  }
  void mood;
}

// ── The mouth ─────────────────────────────────────────────────────────────────

function drawMouth(x: CanvasRenderingContext2D, R: number, mouth: Mouth, t: number) {
  const y = R * 0.32;
  const w = R * 0.14;
  x.save();
  x.translate(0, y);
  x.strokeStyle = INK;
  x.fillStyle = INK;
  x.lineWidth = R * 0.05;
  x.lineCap = "round";
  switch (mouth) {
    case "smile":
      x.beginPath();
      x.arc(0, -w * 0.5, w, Math.PI * 0.2, Math.PI * 0.8);
      x.stroke();
      break;
    case "open":
      x.beginPath();
      x.moveTo(-w, -w * 0.2);
      x.lineTo(w, -w * 0.2);
      x.quadraticCurveTo(w * 0.9, w * 1.1, 0, w * 1.1);
      x.quadraticCurveTo(-w * 0.9, w * 1.1, -w, -w * 0.2);
      x.fill();
      x.fillStyle = "#ff8fa3";
      x.beginPath();
      x.ellipse(0, w * 0.8, w * 0.5, w * 0.3, 0, 0, Math.PI * 2);
      x.fill();
      break;
    case "o":
      x.beginPath();
      x.ellipse(0, w * 0.2, w * 0.4, w * 0.5, 0, 0, Math.PI * 2);
      x.stroke();
      break;
    case "wavy":
      x.beginPath();
      for (let i = 0; i <= 12; i++) {
        const k = i / 12;
        const px = (k - 0.5) * w * 2.2;
        const py = Math.sin(k * Math.PI * 4 + t * 4) * w * 0.2;
        if (i === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.stroke();
      break;
    case "flat":
      x.beginPath();
      x.moveTo(-w * 0.5, 0);
      x.lineTo(w * 0.5, 0);
      x.stroke();
      break;
    case "cat":
      for (const s of [-1, 1]) {
        x.beginPath();
        x.arc(s * w * 0.45, -w * 0.1, w * 0.45, Math.PI * 0.05, Math.PI * 0.95);
        x.stroke();
      }
      break;
    case "fang":
      x.beginPath();
      x.moveTo(-w, w * 0.6);
      x.quadraticCurveTo(0, -w * 0.9, w, w * 0.6);
      x.closePath();
      x.fill();
      x.fillStyle = "#fff";
      x.beginPath();
      x.moveTo(w * 0.2, -w * 0.1);
      x.lineTo(w * 0.55, 0);
      x.lineTo(w * 0.38, w * 0.45);
      x.closePath();
      x.fill();
      break;
  }
  x.restore();
}

// ── Marks around him ──────────────────────────────────────────────────────────

function drawMark(x: CanvasRenderingContext2D, R: number, mark: Mark, t: number, age: number) {
  const pop = Math.min(1, age / 0.2);
  x.save();
  x.lineCap = "round";
  x.lineJoin = "round";
  switch (mark) {
    case "sparkle":
      for (const [px, py, s, ph] of [[1.05, -0.75, 0.24, 0], [-1.1, -0.45, 0.16, 1.4], [1.18, -0.1, 0.12, 2.3]] as const) {
        const tw = 0.55 + 0.45 * Math.sin(t * 5 + ph);
        const r = R * s * pop * (0.6 + 0.4 * tw);
        x.save();
        x.translate(px * R, py * R);
        x.fillStyle = "#ffd35c";
        x.beginPath();
        for (let i = 0; i < 8; i++) {
          const rr = i % 2 ? r * 0.3 : r;
          const a = (i * Math.PI) / 4;
          x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        x.closePath();
        x.fill();
        x.restore();
      }
      break;
    case "sweat": {
      const slide = (t * 0.5) % 1;
      x.translate(R * 1.0, -R * 0.55 + slide * R * 0.3);
      x.globalAlpha = slide > 0.8 ? (1 - slide) / 0.2 : 1;
      const s = R * 0.2 * pop;
      x.fillStyle = "#bfe3ff";
      x.strokeStyle = "#6cb6ff";
      x.lineWidth = R * 0.04;
      x.beginPath();
      x.moveTo(0, -s);
      x.bezierCurveTo(s * 0.75, -s * 0.1, s * 0.6, s * 0.75, 0, s * 0.75);
      x.bezierCurveTo(-s * 0.6, s * 0.75, -s * 0.75, -s * 0.1, 0, -s);
      x.fill();
      x.stroke();
      break;
    }
    case "vein": {
      x.translate(R * 0.82, -R * 0.75);
      const k = pop * (1 + 0.1 * Math.sin(t * 11));
      x.scale(k, k);
      x.strokeStyle = RED;
      x.lineWidth = R * 0.06;
      const a = R * 0.08;
      const b = R * 0.22;
      for (let q = 0; q < 4; q++) {
        x.save();
        x.rotate((q * Math.PI) / 2);
        x.beginPath();
        x.moveTo(a, b);
        x.quadraticCurveTo(a, a, b, a);
        x.stroke();
        x.restore();
      }
      break;
    }
    case "bang":
      x.translate(R * 0.95, -R * 0.85);
      x.rotate(0.18 + Math.sin(t * 6) * 0.06);
      x.font = `900 italic ${R * 0.8 * pop}px "Segoe UI", system-ui, sans-serif`;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.lineWidth = R * 0.14;
      x.strokeStyle = "rgba(0,0,0,0.85)";
      x.strokeText("!", 0, 0);
      x.fillStyle = "#f5a524";
      x.fillText("!", 0, 0);
      break;
    case "z":
      x.fillStyle = "rgba(200,210,235,0.9)";
      x.font = `700 ${R * 0.36}px "Segoe UI", system-ui, sans-serif`;
      for (let i = 0; i < 2; i++) {
        const k = ((t * 0.4 + i * 0.5) % 1);
        x.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2;
        x.fillText("z", R * (0.7 + k * 0.4), -R * (0.6 + k * 0.6));
      }
      break;
    case "heart":
      x.fillStyle = "#ff5f86";
      for (let i = 0; i < 2; i++) {
        const k = (t * 0.6 + i * 0.5) % 1;
        const s = R * 0.14;
        x.save();
        x.translate(R * (i ? -0.95 : 0.95), -R * (0.5 + k * 0.6));
        x.globalAlpha = 1 - k;
        x.beginPath();
        x.moveTo(0, s);
        x.bezierCurveTo(-s * 1.5, 0, -s * 0.6, -s * 1.1, 0, -s * 0.3);
        x.bezierCurveTo(s * 0.6, -s * 1.1, s * 1.5, 0, 0, s);
        x.fill();
        x.restore();
      }
      break;
    case "dots": {
      // A thought bubble with three dots, top left.
      x.translate(-R * 0.95, -R * 0.95);
      x.fillStyle = "#fff";
      x.strokeStyle = INK;
      x.lineWidth = R * 0.04;
      x.beginPath();
      x.ellipse(0, 0, R * 0.42, R * 0.24, 0, 0, Math.PI * 2);
      x.fill();
      x.stroke();
      for (let i = 0; i < 3; i++) {
        const ph = (((t * 2.4 - i * 0.22) % 1) + 1) % 1;
        x.fillStyle = "#6366f1";
        x.beginPath();
        x.arc((i - 1) * R * 0.16, 0, R * 0.045 * (1 + 0.5 * Math.max(0, Math.sin(ph * Math.PI * 2))), 0, Math.PI * 2);
        x.fill();
      }
      break;
    }
  }
  x.restore();
}
