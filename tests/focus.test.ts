import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFS as P, clock, initial, pause, progress, reset, sanitizePrefs, sanitizeState, setMode, setTimer, shown, skip, start, tick } from "../src/focus/timer.ts";
import { afterRing, due, nextRing, sanitizeAlarms, type Alarm } from "../src/focus/alarms.ts";
import { embedUrl, parseYouTube, sanitizeLinks } from "../src/focus/youtube.ts";

const MIN = 60_000;

test("a pomodoro counts down, pauses and resumes", () => {
  let s = start(initial(), 0);
  assert.equal(shown(s, 5 * MIN), 20 * MIN);
  assert.ok(Math.abs(progress(s, 5 * MIN) - 0.2) < 1e-9);
  s = pause(s, 5 * MIN);
  assert.equal(shown(s, 99 * MIN), 20 * MIN, "paused, it waits");
  s = start(s, 10 * MIN);
  assert.equal(shown(s, 15 * MIN), 15 * MIN);
  assert.equal(clock(shown(s, 15 * MIN)), "15:00");
});

test("focus ends into a short break that starts by itself; the fourth into a long one", () => {
  let s = start(initial(), 0);
  let r = tick(s, 25 * MIN, P);
  assert.deepEqual(r.ended, { ended: "focus", next: "short" });
  assert.equal(r.state.phase, "short");
  assert.equal(r.state.running, true, "autoBreak");
  r = tick(r.state, 30 * MIN, P);
  assert.equal(r.state.phase, "focus");
  assert.equal(r.state.running, false, "autoFocus is off");
  s = { ...r.state, round: 3 };
  s = start(s, 0);
  r = tick(s, 25 * MIN, P);
  assert.equal(r.state.phase, "long");
  r = skip(r.state, 0, P);
  assert.equal(r.state.round, 0, "a long break starts the cycle again");
  assert.equal(r.ended, null);
});

test("a timer rings once and stops; the stopwatch counts up", () => {
  let s = start(setTimer(initial(), 3), 0);
  assert.equal(tick(s, 2 * MIN, P).ended, null);
  const r = tick(s, 3 * MIN, P);
  assert.deepEqual(r.ended, { ended: "timer", next: null });
  assert.equal(r.state.running, false);
  s = start(setMode(initial(), "stopwatch", P), 1000);
  assert.equal(shown(s, 6000), 5000);
  s = pause(s, 6000);
  s = start(s, 10_000);
  assert.equal(shown(s, 11_000), 6000);
  assert.equal(shown(reset(s, P), 99_000), 0);
  assert.equal(clock(3_725_000), "1:02:05");
});

test("saved focus state and preferences are checked", () => {
  assert.deepEqual(sanitizeState(null, P), initial(P));
  assert.deepEqual(sanitizeState({ mode: "nope" }, P), initial(P));
  const s = start(initial(), 5);
  assert.deepEqual(sanitizeState(JSON.parse(JSON.stringify(s)), P), s);
  assert.deepEqual(sanitizePrefs({ focus: 500, short: "x", autoBreak: false }), { ...P, focus: 180, autoBreak: false });
});

test("alarms ring at their time, on their days; once-only ones turn off", () => {
  const a: Alarm = { id: "a", time: "07:30", days: [], label: "", tone: "bell", on: true };
  const mon = new Date(2026, 10, 16, 6, 0).getTime(); // a Monday
  assert.equal(nextRing(a, mon), new Date(2026, 10, 16, 7, 30).getTime());
  const weekend = { ...a, days: [0, 6] };
  assert.equal(new Date(nextRing(weekend, mon)!).getDay(), 6);
  assert.deepEqual(due([a, weekend], new Date(2026, 10, 16, 7, 29, 30).getTime(), new Date(2026, 10, 16, 7, 30, 0).getTime()).map((x) => x.id), ["a"]);
  assert.deepEqual(due([a], new Date(2026, 10, 16, 7, 30, 0).getTime(), new Date(2026, 10, 16, 7, 31).getTime()), [], "not twice");
  assert.equal(afterRing(a).on, false);
  assert.equal(afterRing(weekend).on, true);
  assert.equal(nextRing({ ...a, on: false }, mon), null);
  assert.deepEqual(sanitizeAlarms([{ time: "25:00" }, { id: "x", time: "6:05", days: [1, 1, 9] }]).map((x) => [x.id, x.days]), [["x", [1]]]);
});

test("YouTube links: videos, short links, shorts and playlists", () => {
  assert.deepEqual(parseYouTube("https://www.youtube.com/watch?v=jfKfPfyJRdk"), { video: "jfKfPfyJRdk", list: null });
  assert.deepEqual(parseYouTube("https://youtu.be/jfKfPfyJRdk?t=30"), { video: "jfKfPfyJRdk", list: null });
  assert.deepEqual(parseYouTube("https://youtube.com/shorts/jfKfPfyJRdk"), { video: "jfKfPfyJRdk", list: null });
  assert.deepEqual(parseYouTube("https://music.youtube.com/playlist?list=PLOfmy3sLdTr8wZ1g6Fq4BPyAI9MZw0Tg9"), { video: null, list: "PLOfmy3sLdTr8wZ1g6Fq4BPyAI9MZw0Tg9" });
  assert.equal(parseYouTube("https://vimeo.com/123"), null);
  assert.equal(parseYouTube("not a link"), null);
  const e = embedUrl({ video: "jfKfPfyJRdk", list: null });
  assert.ok(e.startsWith("https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?"));
  assert.ok(e.includes("loop=1") && e.includes("playlist=jfKfPfyJRdk"));
  assert.ok(embedUrl({ video: null, list: "PLOfmy3sLdTr8w" }).includes("embed/videoseries?"));
  assert.equal(sanitizeLinks([{ url: "https://youtu.be/jfKfPfyJRdk" }, { url: "x" }]).length, 1);
});

test("YouTube repeats on demand", () => {
  assert.ok(embedUrl({ video: "jfKfPfyJRdk", list: null }, true).includes("loop=1"));
  assert.ok(!embedUrl({ video: "jfKfPfyJRdk", list: null }, false).includes("loop=1"));
  assert.ok(embedUrl({ video: null, list: "PLOfmy3sLdTr8w" }, true).includes("loop=1"));
});
