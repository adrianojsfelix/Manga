import { test } from "node:test";
import assert from "node:assert/strict";
import { setLanguage } from "../src/core/i18n.ts";
import { lockChange, merge, percent, progressText, size, type Download } from "../src/system/activity.ts";
import { announce, appColor } from "../src/notify/notices.ts";

setLanguage("pt");
const dl = (p: Partial<Download>): Download => ({ id: "a", name: "x.zip", bytes: 0, total: 0, speed: 0, state: "downloading", file: "", ...p });

test("the lock key that changed", () => {
  const off = { caps: false, num: true, scroll: false };
  assert.deepEqual(lockChange(off, { ...off, caps: true }), { key: "caps", on: true });
  assert.deepEqual(lockChange(off, { ...off, num: false }), { key: "num", on: false });
  assert.equal(lockChange(off, off), null);
});

test("sizes read short, in Portuguese", () => {
  assert.equal(size(512), "512 B");
  assert.equal(size(1536), "1,5 KB");
  assert.equal(size(4.2 * 1024 * 1024), "4,2 MB");
  assert.equal(size(250 * 1024 * 1024), "250 MB");
});

test("a download's percent and line", () => {
  assert.equal(percent(dl({ bytes: 50, total: 200 })), 25);
  assert.equal(percent(dl({ bytes: 200, total: 200 })), 99, "100 only once finished");
  assert.equal(percent(dl({ bytes: 50 })), null);
  assert.equal(percent(dl({ state: "done" })), 100);
  assert.equal(progressText(dl({ bytes: 1024 * 1024, total: 4 * 1024 * 1024, speed: 2048 })), "25% de 4 MB · 2 KB/s");
  assert.equal(progressText(dl({ bytes: 3 * 1024 * 1024 })), "3 MB");
  assert.equal(progressText(dl({ state: "done", bytes: 1024 })), "Concluído · 1 KB");
});

test("downloads merge by id; cancelled ones leave", () => {
  let l = merge([], [dl({ id: "a", bytes: 1 }), dl({ id: "b" })]);
  l = merge(l, [dl({ id: "a", bytes: 5 })]);
  assert.equal(l[0].bytes, 5);
  l = merge(l, [dl({ id: "b", state: "cancelled" })]);
  assert.deepEqual(l.map((d) => d.id), ["a"]);
});

test("Kumo announces, and apps keep a colour", () => {
  assert.equal(announce("WhatsApp", 1, 0), "Chegou do WhatsApp!");
  assert.equal(announce("WhatsApp", 3, 0), "3 notificações novas!");
  assert.equal(appColor("Teams"), appColor("Teams"));
  assert.notEqual(appColor("Teams"), appColor("Slack"));
});
