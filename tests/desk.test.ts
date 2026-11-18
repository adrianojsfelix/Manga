import { test } from "node:test";
import assert from "node:assert/strict";
import { addToShelf, clipPreview, extension, fileName, nextLayout, sanitizeShelf } from "../src/desk/shelf.ts";

test("the shelf keeps files once each, the newest on top", () => {
  let s = addToShelf([], ["C:\\docs\\a.pdf", "C:\\b.png"], 1);
  assert.deepEqual(s.map((x) => x.name), ["a.pdf", "b.png"]);
  s = addToShelf(s, ["C:\\b.png"], 2);
  assert.deepEqual(s.map((x) => [x.name, x.added]), [["b.png", 2], ["a.pdf", 1]]);
  assert.equal(fileName("C:\\pasta\\"), "pasta");
  assert.deepEqual(sanitizeShelf([{ path: "" }, { path: "/x/y.txt" }, 3]).map((x) => x.name), ["y.txt"]);
});

test("small helpers", () => {
  assert.equal(extension("contrato.final.pdf"), "PDF");
  assert.equal(extension("Makefile"), "");
  assert.equal(extension(".gitignore"), "");
  const l = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.equal(nextLayout(l, 2)?.id, 3);
  assert.equal(nextLayout(l, 3)?.id, 1);
  assert.equal(nextLayout(l, 99)?.id, 1);
  assert.equal(nextLayout([], 1), null);
  assert.equal(clipPreview("  oi\n\n  tudo   bem? "), "oi tudo bem?");
  assert.equal(clipPreview("x".repeat(100), 10), "xxxxxxxxx…");
});
