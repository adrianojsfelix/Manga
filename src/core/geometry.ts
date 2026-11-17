// The island's shape and size, in CSS pixels. Pure: tested on its own.
//
// Three sizes, as the user picks how much the island shows at rest:
// - small: a pill with the mascot and one or two items (the clock…);
// - medium: wider, with the items of the bar (weather, battery, what plays…);
// - extended: open, with a page (the assistant, the controls, focus…).
// Two shapes: "floating", a pill a little below the top of the screen, every
// corner round (the iPhone's Dynamic Island); "notch", glued to the top edge,
// only the bottom corners round (a MacBook's notch).

export type IslandSize = "small" | "medium" | "extended";
export type IslandShape = "floating" | "notch";

export interface Box {
  width: number;
  height: number;
  /** Corner radius of the corners that are round. */
  radius: number;
  /** Space above the island (floating only). */
  gap: number;
}

/** Room around the island in its window, for its shadow and glow. */
export const MARGIN = 18;

const SIZES: Record<IslandSize, { width: number; height: number }> = {
  small: { width: 210, height: 34 },
  medium: { width: 420, height: 40 },
  extended: { width: 680, height: 300 },
};

/** The island's box for a size, a shape and a scale (0.8–1.4, the user's "size"). */
export function islandBox(size: IslandSize, shape: IslandShape, scale = 1, extendedHeight?: number): Box {
  const k = Math.min(1.4, Math.max(0.8, scale));
  const base = SIZES[size];
  const height = Math.round((size === "extended" && extendedHeight ? extendedHeight : base.height) * k);
  const width = Math.round(base.width * k);
  const radius = size === "extended" ? Math.round(26 * k) : Math.round(height / 2);
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
