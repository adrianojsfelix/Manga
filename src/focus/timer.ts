// Focus: the pomodoro (focus, short and long breaks), a timer and a
// stopwatch. Pure: the time comes in as `now` (ms), so it is tested alone,
// and the state is saved as it is (it survives a restart of the app).

export type Mode = "pomodoro" | "timer" | "stopwatch";
export type Phase = "focus" | "short" | "long" | "timer" | "stopwatch";

export interface FocusPrefs {
  /** Minutes. */
  focus: number;
  short: number;
  long: number;
  /** Focus rounds before a long break. */
  rounds: number;
  /** The break starts by itself when focus ends (and focus after a break). */
  autoBreak: boolean;
  autoFocus: boolean;
}

export const DEFAULT_PREFS: FocusPrefs = { focus: 25, short: 5, long: 15, rounds: 4, autoBreak: true, autoFocus: false };

export interface FocusState {
  mode: Mode;
  phase: Phase;
  running: boolean;
  /** When the phase ends (running countdowns). */
  endsAt: number | null;
  /** Left, in ms, while paused (countdowns) — or elapsed (stopwatch). */
  left: number;
  /** The phase's full length, ms (0 for the stopwatch). */
  length: number;
  /** Stopwatch: when it started counting, minus what it had. */
  since: number | null;
  /** Focus rounds done in this cycle. */
  round: number;
  /** The timer's chosen length, ms. */
  timerLength: number;
}

const MIN = 60_000;

export function initial(prefs: FocusPrefs = DEFAULT_PREFS): FocusState {
  return { mode: "pomodoro", phase: "focus", running: false, endsAt: null, left: prefs.focus * MIN, length: prefs.focus * MIN, since: null, round: 0, timerLength: 10 * MIN };
}

export function phaseLength(phase: Phase, prefs: FocusPrefs, timerLength: number): number {
  switch (phase) {
    case "focus": return prefs.focus * MIN;
    case "short": return prefs.short * MIN;
    case "long": return prefs.long * MIN;
    case "timer": return timerLength;
    case "stopwatch": return 0;
  }
}

/** Switches mode: stopped, at the start of its first phase. */
export function setMode(s: FocusState, mode: Mode, prefs: FocusPrefs): FocusState {
  const phase: Phase = mode === "pomodoro" ? "focus" : mode;
  const length = phaseLength(phase, prefs, s.timerLength);
  return { ...s, mode, phase, running: false, endsAt: null, since: null, left: mode === "stopwatch" ? 0 : length, length, round: mode === "pomodoro" ? s.round : 0 };
}

/** The timer's length (minutes), stopped at its start. */
export function setTimer(s: FocusState, minutes: number): FocusState {
  const len = Math.round(Math.min(24 * 60, Math.max(1, minutes))) * MIN;
  return { ...s, mode: "timer", phase: "timer", timerLength: len, length: len, left: len, running: false, endsAt: null };
}

export function start(s: FocusState, now: number): FocusState {
  if (s.running) return s;
  if (s.mode === "stopwatch") return { ...s, running: true, since: now - s.left };
  const left = s.left > 0 ? s.left : s.length;
  return { ...s, running: true, endsAt: now + left, left };
}

export function pause(s: FocusState, now: number): FocusState {
  if (!s.running) return s;
  if (s.mode === "stopwatch") return { ...s, running: false, left: now - (s.since ?? now), since: null };
  return { ...s, running: false, left: Math.max(0, (s.endsAt ?? now) - now), endsAt: null };
}

/** Back to the phase's start (the stopwatch to zero). */
export function reset(s: FocusState, prefs: FocusPrefs): FocusState {
  const length = phaseLength(s.phase, prefs, s.timerLength);
  return { ...s, running: false, endsAt: null, since: null, left: s.mode === "stopwatch" ? 0 : length, length };
}

/** Ms left (countdowns) or elapsed (stopwatch). */
export function shown(s: FocusState, now: number): number {
  if (s.mode === "stopwatch") return s.running ? now - (s.since ?? now) : s.left;
  return s.running ? Math.max(0, (s.endsAt ?? now) - now) : s.left;
}

/** 0–1 of the phase gone. */
export function progress(s: FocusState, now: number): number {
  if (s.mode === "stopwatch" || !s.length) return 0;
  return Math.min(1, Math.max(0, 1 - shown(s, now) / s.length));
}

/** The pomodoro's next phase after this one ends. */
export function nextPhase(s: FocusState, prefs: FocusPrefs): { phase: Phase; round: number } {
  if (s.phase === "focus") {
    const round = s.round + 1;
    return { phase: round % prefs.rounds === 0 ? "long" : "short", round };
  }
  return { phase: "focus", round: s.phase === "long" ? 0 : s.round };
}

export interface Ended {
  /** The phase that ended. */
  ended: Phase;
  /** What comes now (pomodoro), or null. */
  next: Phase | null;
}

/** Moves the clock: a countdown at zero ends, the pomodoro moves to its next phase. */
export function tick(s: FocusState, now: number, prefs: FocusPrefs): { state: FocusState; ended: Ended | null } {
  if (!s.running || s.mode === "stopwatch" || (s.endsAt ?? Infinity) > now) return { state: s, ended: null };
  if (s.mode === "timer") return { state: { ...s, running: false, endsAt: null, left: s.length }, ended: { ended: "timer", next: null } };
  return skip(s, now, prefs, true);
}

/** Jumps to the pomodoro's next phase (now, or because it ended). */
export function skip(s: FocusState, now: number, prefs: FocusPrefs, ended = false): { state: FocusState; ended: Ended | null } {
  if (s.mode !== "pomodoro") return { state: reset(s, prefs), ended: null };
  const n = nextPhase(s, prefs);
  const length = phaseLength(n.phase, prefs, s.timerLength);
  const auto = n.phase === "focus" ? prefs.autoFocus : prefs.autoBreak;
  const run = ended && auto;
  const state: FocusState = { ...s, phase: n.phase, round: n.round, length, left: length, running: run, endsAt: run ? now + length : null };
  return { state, ended: ended ? { ended: s.phase, next: n.phase } : null };
}

/** "25:00", "1:05:09". */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${String(m).padStart(2, "0")}:${sec}`;
}

/** Saved state, checked: a broken one starts over. */
export function sanitizeState(raw: unknown, prefs: FocusPrefs): FocusState {
  const base = initial(prefs);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<FocusState>;
  const modes: Mode[] = ["pomodoro", "timer", "stopwatch"];
  const phases: Phase[] = ["focus", "short", "long", "timer", "stopwatch"];
  if (!modes.includes(r.mode as Mode) || !phases.includes(r.phase as Phase)) return base;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  return {
    mode: r.mode as Mode,
    phase: r.phase as Phase,
    running: r.running === true,
    endsAt: r.endsAt == null ? null : num(r.endsAt, 0),
    left: num(r.left, base.left),
    length: num(r.length, base.length),
    since: r.since == null ? null : num(r.since, 0),
    round: Math.floor(num(r.round, 0)),
    timerLength: num(r.timerLength, base.timerLength) || base.timerLength,
  };
}

export function sanitizePrefs(raw: unknown): FocusPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (k: keyof FocusPrefs, lo: number, hi: number) => {
    const v = r[k];
    return typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : (DEFAULT_PREFS[k] as number);
  };
  const b = (k: keyof FocusPrefs) => (typeof r[k] === "boolean" ? (r[k] as boolean) : (DEFAULT_PREFS[k] as boolean));
  return { focus: n("focus", 1, 180), short: n("short", 1, 60), long: n("long", 1, 120), rounds: n("rounds", 1, 12), autoBreak: b("autoBreak"), autoFocus: b("autoFocus") };
}
