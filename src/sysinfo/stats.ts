// The PC's numbers as the island shows them. Pure: tested on its own.

export interface SysInfo {
  cpu: number;
  ramUsed: number;
  ramTotal: number;
  /** -1: unknown. */
  gpu: number;
  vramUsed: number;
  vramTotal: number;
  down: number;
  up: number;
  diskUsed: number;
  diskTotal: number;
  uptime: number;
}

/** The last `n` values, newest last. */
export function push(history: readonly number[], v: number, n = 60): number[] {
  const out = [...history, v];
  return out.length > n ? out.slice(out.length - n) : out;
}

export function pct(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

/** "3 d 4 h", "5 h 12 min", "8 min". */
export function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}

/** A sparkline's points (SVG polyline) for values 0–max in a w×h box. */
export function sparkline(values: readonly number[], w: number, h: number, max?: number): string {
  if (!values.length) return "";
  const top = max ?? Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values.map((v, i) => `${(i * step).toFixed(1)},${(h - (Math.min(v, top) / top) * h).toFixed(1)}`).join(" ");
}
