import { test } from "node:test";
import assert from "node:assert/strict";
import { MARGIN, borderRadius, earSize, islandBox, windowPosition, windowSize } from "../src/core/geometry.ts";
import { INITIAL, next } from "../src/core/island-state.ts";

test("each size has its box; a floating island sits below the top, a notch on it", () => {
  const small = islandBox("small", "floating");
  assert.deepEqual(small, { width: 200, height: 32, radius: 16, gap: 8 });
  const notch = islandBox("small", "notch");
  assert.equal(notch.gap, 0);
  assert.equal(notch.radius, 13, "a notch's corners are tighter than a pill's");
  assert.equal(earSize(notch, "notch"), 8);
  assert.equal(earSize(small, "floating"), 0, "a floating pill has no ears");
  assert.equal(borderRadius(small, "floating"), "16px");
  assert.equal(borderRadius(islandBox("medium", "notch"), "notch"), "0 0 15px 15px");
  const big = islandBox("extended", "floating", 1, 360);
  assert.equal(islandBox("extended", "notch").height, 320);
  assert.equal(big.height, 360);
  assert.equal(big.radius, 26);
});

test("the scale is the user's size, kept within reason", () => {
  assert.equal(islandBox("small", "floating", 1.2).width, 240);
  assert.equal(islandBox("small", "floating", 5).width, Math.round(200 * 1.4));
  assert.equal(islandBox("small", "floating", 0).width, Math.round(200 * 0.8));
});

test("the window holds the island and its shadow, centred at the top of its monitor", () => {
  const box = islandBox("medium", "floating");
  const win = windowSize(box);
  assert.deepEqual(win, { width: 460 + MARGIN * 2, height: 8 + 36 + MARGIN });
  assert.deepEqual(windowPosition({ x: 1920, y: 0, width: 2560 }, win), { x: 1920 + (2560 - win.width) / 2, y: 0 });
});

test("the pointer peeks, a click opens, leaving folds back to the size it rests at", () => {
  let s = INITIAL;
  s = next(s, { type: "enter" });
  assert.equal(s.size, "medium");
  s = next(s, { type: "leave" });
  assert.equal(s.size, "small");
  s = next(next(s, { type: "enter" }), { type: "click" });
  assert.equal(s.size, "extended");
  s = next(s, { type: "leave" });
  assert.equal(s.size, "extended", "open stays open until it folds");
  s = next(s, { type: "fold" });
  assert.equal(s.size, "small");
});

test("something held keeps it open; resting at medium folds to medium", () => {
  let s = next(next(INITIAL, { type: "open", page: "focus" }), { type: "hold", on: true });
  assert.equal(next(s, { type: "fold" }).size, "extended");
  s = next(next(s, { type: "hold", on: false }), { type: "rest", size: "medium" });
  assert.equal(s.size, "extended");
  assert.equal(next(s, { type: "fold" }).size, "medium");
  assert.equal(s.page, "focus");
});

test("the bars rest wide, peek nowhere, and open on a click", async () => {
  const { next, INITIAL } = await import("../src/core/island-state.ts");
  const { islandBox } = await import("../src/core/geometry.ts");
  let s = next(INITIAL, { type: "rest", size: "bar" });
  assert.equal(s.size, "bar");
  s = next(s, { type: "enter" });
  assert.equal(s.size, "bar");
  s = next(s, { type: "click" });
  assert.equal(s.size, "extended");
  s = next(next(s, { type: "leave" }), { type: "fold" });
  assert.equal(s.size, "bar");
  assert.equal(islandBox("wide", "notch", 1, undefined, 1920).width, 1760);
  assert.equal(islandBox("wide", "notch", 1, undefined, 700).width, 780, "never narrower than the bar");
});
