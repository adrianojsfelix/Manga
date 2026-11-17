// The island's shape and size, in CSS pixels. Pure: tested on its own.
//
// Three sizes, as the user picks how much the island shows at rest:
// - small: a pill with the mascot and one or two items (the clock…);
// - medium: wider, with the items of the bar (weather, battery, what plays…);
// - bar: a wider strip, with the tools' icons too;
// - wide: almost the screen's width;
// - extended: open, with a page (the assistant, the controls, focus…).
// Two shapes: "notch" (the default), glued to the top edge like a MacBook's,
// its bottom corners round and two little "ears" curving into the screen's
// edge at the top; or "floating", a pill a little below the top of the
// screen, every corner round (the iPhone's Dynamic Island).

export type IslandSize = "small" | "medium" | "bar" | "wide" | "extended";
export type IslandShape = "floating" | "notch";

export interface Box {
  width: number;
  height: number;
  /** Corner radius of the corners that are round. */
  radius: number;
  /** Space above the island (floating only). */
  gap: number;
}

/** Room around the island in its window, for its shadow, glow and ears. */
export const MARGIN = 18;

/** The notch's ears: how far they curve into the screen's top edge. */
export function earSize(box: Box, shape: IslandShape): number {
  return shape === "notch" ? Math.min(12, Math.round(box.radius * 0.6)) : 0;
}

const SIZES: Record<IslandSize, { width: number; height: number }> = {
  small: { width: 200, height: 32 },
  medium: { width: 460, height: 36 },
  bar: { width: 780, height: 36 },
  wide: { width: 1200, height: 36 },
  extended: { width: 700, height: 320 },
};

/** The island's box for a size, a shape and a scale (0.8–1.4, the user's "size"). */
export function islandBox(size: IslandSize, shape: IslandShape, scale = 1, extendedHeight?: number, screenWidth?: number): Box {
  const k = Math.min(1.4, Math.max(0.8, scale));
  const base = SIZES[size];
  const height = Math.round((size === "extended" && extendedHeight ? extendedHeight : base.height) * k);
  // The wide bar: the screen's width less a margin each side (never under the bar).
  const width = size === "wide" && screenWidth ? Math.max(Math.round(SIZES.bar.width * k), Math.round(screenWidth - 160)) : Math.round(base.width * k);
  // A notch's corners are tighter than a pill's, as on a MacBook.
  const radius = size === "extended" ? Math.round(26 * k) : shape === "notch" ? Math.round(height * 0.42) : Math.round(height / 2);
  return { width, height, radius, gap: shape === "floating" ? Math.round(8 * k) : 0 };
}

/** The CSS border-radius for a box: every corner floating, the bottom ones as a notch. */
export function borderRadius(box: Box, shape: IslandShape): string {
  return shape === "floating" ? `${box.radius}px` : `0 0 ${box.radius}px ${box.radius}px`;
}

/** The window the island sits in: its box plus the margin, the island centred at the top. */
export function windowSize(box: Box): { width: number; height: number } {
  return { width: box.width + MARGIN * 2, height: box.gap + box.height + MARGIN };
}

/**
 * Where the window goes on a monitor (physical or logical alike): centred
 * horizontally, at the very top.
 */
export function windowPosition(monitor: { x: number; y: number; width: number }, win: { width: number }): { x: number; y: number } {
  return { x: Math.round(monitor.x + (monitor.width - win.width) / 2), y: monitor.y };
}
