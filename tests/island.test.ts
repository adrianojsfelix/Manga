import { test } from "node:test";
import assert from "node:assert/strict";
import { MARGIN, borderRadius, islandBox, windowPosition, windowSize } from "../src/core/geometry.ts";
import { INITIAL, next } from "../src/core/island-state.ts";

test("each size has its box; a floating island sits below the top, a notch on it", () => {
  const small = islandBox("small", "floating");
  assert.deepEqual(small, { width: 210, height: 34, radius: 17, gap: 8 });
  assert.equal(islandBox("small", "notch").gap, 0);
  assert.equal(borderRadius(small, "floating"), "17px");
  assert.equal(borderRadius(islandBox("medium", "notch"), "notch"), "0 0 20px 20px");
  const big = islandBox("extended", "floating", 1, 360);
  assert.equal(big.height, 360);
  assert.equal(big.radius, 26);
});

test("the scale is the user's size, kept within reason", () => {
  assert.equal(islandBox("small", "floating", 1.2).width, 252);
  assert.equal(islandBox("small", "floating", 5).width, Math.round(210 * 1.4));
  assert.equal(islandBox("small", "floating", 0).width, Math.round(210 * 0.8));
});

test("the window holds the island and its shadow, centred at the top of its monitor", () => {
  const box = islandBox("medium", "floating");
  const win = windowSize(box);
  assert.deepEqual(win, { width: 420 + MARGIN * 2, height: 8 + 40 + MARGIN });
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
