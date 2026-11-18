import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOOK, background, inkOn, sanitizeLook, saveProfile } from "../src/core/look.ts";

test("the look keeps what is valid", () => {
  assert.deepEqual(sanitizeLook(null), DEFAULT_LOOK);
  const l = sanitizeLook({ color: "#1A2B3C", glass: 0.1, accent: "red", font: "sans", open: "hover", fold: 99, monitor: "2", fullscreen: "x" });
  assert.deepEqual(l, { ...DEFAULT_LOOK, color: "#1a2b3c", glass: 0.5, font: "sans", open: "hover", fold: 6, monitor: "2" });
  assert.equal(sanitizeLook({ monitor: "evil" }).monitor, "current");
});

test("glass is the colour with some of the screen through it", () => {
  assert.equal(background("#000000", 1), "#000000");
  assert.equal(background("#102030", 0.7), "rgba(16, 32, 48, 0.7)");
  assert.equal(inkOn("#ffffff"), "#17131f");
  assert.equal(inkOn("#101010"), "#f5f3fa");
});

test("profiles: by name, the same name replaced, newest first", () => {
  let p = saveProfile([], "Trabalho", 1);
  p = saveProfile(p, "Jogo", 2);
  p = saveProfile(p, " trabalho ", 3);
  assert.deepEqual(p.map((x) => [x.name, x.data]), [["trabalho", 3], ["Jogo", 2]]);
  assert.equal(saveProfile(p, "  ", 9).length, 2);
});
