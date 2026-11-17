// Manga: the island at the top of Windows.

import { IN_APP } from "./core/bridge.ts";
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

if (!IN_APP) document.body.classList.add("browser");
const island = new Island(document.getElementById("island-root")!, sanitizeItems(saved("manga.items")));
// The dev page drives it from the console.
Object.assign(window, { island });
