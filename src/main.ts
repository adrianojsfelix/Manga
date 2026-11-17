// Manga: the island at the top of Windows.

import { IN_APP } from "./core/bridge.ts";
import { sanitizeSettings, type Settings } from "./core/settings.ts";
import { Island } from "./island/island.ts";
import { sanitizeItems } from "./items/registry.ts";

function saved(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function keep(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage off: the settings last until the island closes */
  }
}

if (!IN_APP) document.body.classList.add("browser");
const island = new Island(
  document.getElementById("island-root")!,
  sanitizeItems(saved("manga.items")),
  sanitizeSettings(saved("manga.settings")),
  (s: Settings) => keep("manga.settings", s),
);
// The dev page drives it from the console: island.notify({...}).
Object.assign(window, { island });
