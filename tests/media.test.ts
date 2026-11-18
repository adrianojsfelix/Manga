import { test } from "node:test";
import assert from "node:assert/strict";
import { bars, clock, positionNow, subtitle, tintOf, type Media } from "../src/media/media.ts";

const song: Media = { app: "Spotify", title: "Lofi", artist: "Kumo", album: "", playing: true, position: 10, duration: 100, cover: "", canSeek: true, canSkip: true };

test("times read as a player's", () => {
  assert.equal(clock(0), "0:00");
  assert.equal(clock(187.9), "3:07");
  assert.equal(clock(3765), "1:02:45");
  assert.equal(clock(-4), "0:00");
});

test("the position moves on while it plays, never past the end", () => {
  assert.equal(positionNow(song, 1000, 6000), 15);
  assert.equal(positionNow({ ...song, playing: false }, 1000, 6000), 10);
  assert.equal(positionNow(song, 0, 500_000), 100);
  assert.equal(positionNow({ ...song, duration: 0 }, 0, 500_000), 510);
});

test("the second line has the artist and the app, once each", () => {
  assert.equal(subtitle(song), "Kumo · Spotify");
  assert.equal(subtitle({ ...song, artist: "" }), "Spotify");
  assert.equal(subtitle({ ...song, artist: "Spotify" }), "Spotify");
});

test("waves stay in bounds and are still when silent", () => {
  for (const t of [0, 0.3, 1.7, 9]) {
    const b = bars(0.8, t, 5);
    assert.equal(b.length, 5);
    for (const x of b) assert.ok(x >= 0.12 && x <= 1);
  }
  assert.deepEqual(bars(0, 3), [0.12, 0.12, 0.12, 0.12]);
});

test("the tint is a darkened glass of the cover's colour", () => {
  assert.equal(tintOf(200, 100, 0), "linear-gradient(160deg, rgba(110, 55, 0, 0.85), rgba(0, 0, 0, 0) 70%)");
});

test("the playing app's volume line is found by name", async () => {
  const { appOf } = await import("../src/media/media.ts");
  const apps = [{ name: "Chrome" }, { name: "Spotify" }, { name: "Media Player" }];
  assert.equal(appOf(apps, "Chrome")?.name, "Chrome");
  assert.equal(appOf(apps, "Spotify Music")?.name, "Spotify");
  assert.equal(appOf(apps, "MediaPlayer")?.name, "Media Player");
  assert.equal(appOf(apps, "VLC"), null);
  assert.equal(appOf(apps, ""), null);
});
