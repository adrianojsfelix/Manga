// The shelf: files dropped on the island, kept at hand to open, show in
// their folder or copy. And the desk's small pure helpers. Tested alone.

export interface ShelfItem {
  path: string;
  name: string;
  /** Ms. */
  added: number;
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

/** Files added on top, once each (an existing one moves up). */
export function addToShelf(list: readonly ShelfItem[], paths: readonly string[], now: number): ShelfItem[] {
  const fresh = paths.filter((p) => p.trim()).map((path) => ({ path, name: fileName(path), added: now }));
  const keep = list.filter((x) => !paths.includes(x.path));
  return [...fresh, ...keep].slice(0, 40);
}

export function sanitizeShelf(raw: unknown): ShelfItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof x.path === "string" && x.path !== "")
    .map((x) => ({ path: x.path as string, name: fileName(x.path as string), added: typeof x.added === "number" ? x.added : 0 }))
    .slice(0, 40);
}

/** "contrato.final.pdf" → "PDF"; no extension: "". */
export function extension(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toUpperCase().slice(0, 4) : "";
}

/** The next keyboard layout after the current one (going round). */
export function nextLayout<T extends { id: number }>(layouts: readonly T[], current: number): T | null {
  if (!layouts.length) return null;
  const i = layouts.findIndex((l) => l.id === current);
  return layouts[(i + 1) % layouts.length];
}

/** A clip's one-line preview. */
export function clipPreview(text: string, max = 90): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}
