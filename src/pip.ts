// The picture-in-picture window's bar: what plays, its buttons, another
// window to show, close. The picture itself is Windows' (src-tauri/src/pip.rs).

import { getCurrentWindow } from "@tauri-apps/api/window";
import { Bridge, on } from "./core/bridge.ts";
import { t } from "./core/i18n.ts";
import { el, icon } from "./island/dom.ts";
import { I } from "./island/icons.ts";
import type { Media } from "./media/media.ts";

const bar = document.getElementById("pip-bar")!;
const title = el("span", "pip-title", "");
title.dataset.tauriDragRegion = "";
const play = el("button", "pip-btn");

function button(path: string, label: string, act: () => void, cls = "") {
  const b = el("button", `pip-btn ${cls}`);
  b.title = label;
  b.append(icon(path, 16));
  b.addEventListener("click", act);
  return b;
}

let playing = false;
function show(m: Media | null) {
  title.textContent = m ? [m.title, m.app].filter(Boolean).join(" · ") : t("Nothing playing");
  playing = !!m?.playing;
  play.replaceChildren(icon(playing ? I.pause : I.play, 16));
  play.title = playing ? t("Pause") : t("Play");
}
play.addEventListener("click", () => void Bridge.mediaControl("play_pause"));

// Another window: a native list, drawn above the picture.
const pickWrap = el("span", "pip-pick-wrap");
const pickIcon = button(I.windows, t("Show another window"), () => {});
const pick = el("select", "pip-pick");
pick.title = t("Show another window");
pick.addEventListener("pointerdown", async () => {
  const list = (await Bridge.pipWindows()) ?? [];
  pick.replaceChildren(el("option", "", t("Show another window")));
  for (const w of list.slice(0, 30)) {
    const o = el("option", "", `${w.app} — ${w.title}`.slice(0, 90));
    o.value = String(w.id);
    pick.append(o);
  }
});
pick.addEventListener("change", async () => {
  const id = Number(pick.value);
  if (id) await Bridge.pipOpen(id);
});
pickWrap.append(pickIcon, pick);

bar.append(
  title,
  button(I.prev, t("Previous"), () => void Bridge.mediaControl("previous")),
  play,
  button(I.next, t("Next"), () => void Bridge.mediaControl("next")),
  pickWrap,
  button(I.close, t("Close"), () => void Bridge.pipClose().then(() => getCurrentWindow().close()), "close"),
);
show(null);
on<Media | null>("media", show);
