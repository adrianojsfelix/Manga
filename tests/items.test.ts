import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ITEMS, ITEMS, itemView, sanitizeItems } from "../src/items/registry.ts";
import { faceOf } from "../src/mascot/kumo.ts";

test("every item the user asked for is planned, each once, with its phase", () => {
  const ids = ITEMS.map((i) => i.id);
  for (const id of ["clock", "date", "weather", "battery", "waves", "countdown", "water", "recycle", "keyboard", "taskbar"]) {
    assert.ok(ids.includes(id), id);
  }
  assert.equal(new Set(ids).size, ids.length);
});

test("saved items keep known ones, once each, the small island two at most", () => {
  assert.deepEqual(sanitizeItems(null), DEFAULT_ITEMS);
  assert.deepEqual(sanitizeItems({ small: ["clock", "clock", "nope", "date", "weather"], medium: "x" }), { small: ["clock", "date"], medium: DEFAULT_ITEMS.medium });
});

test("the clock and the date read in the user's language", () => {
  const d = new Date(2026, 10, 17, 9, 5);
  assert.match(itemView("clock", d).text, /09:05/);
  assert.match(itemView("date", d).text, /17/);
  assert.equal(itemView("weather", d), null, "not built yet");
});

test("every mood has a face, and the ahoge says it", () => {
  assert.equal(faceOf("question").ahoge, "curl");
  assert.equal(faceOf("angry").ahoge, "zigzag");
  assert.equal(faceOf("sad").ahoge, "droop");
  assert.equal(faceOf("surprised").ahoge, "up");
  assert.deepEqual(faceOf("angry").marks, ["vein"]);
  assert.equal(faceOf("idle").mouth, "none");
});

test("battery and notifications show only when there is something", () => {
  const d = new Date(2026, 10, 17, 9, 5);
  assert.equal(itemView("battery", d), null);
  assert.equal(itemView("battery", d, { battery: { level: 0.834, charging: false } })?.text, "83%");
  assert.equal(itemView("battery", d, { battery: { level: 1, charging: true } })?.text, "⚡100%");
  assert.equal(itemView("notifications", d, { unread: 0 }), null);
  assert.equal(itemView("notifications", d, { unread: 3 })?.text, "● 3");
});
