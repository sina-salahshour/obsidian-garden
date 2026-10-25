/** Parse #rgb / #rrggbb into [r, g, b]. Returns null for anything else. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, "0");

/** Mix `a` into `b` by `t` (0 = b, 1 = a), in sRGB. Unparseable input returns `a` unchanged. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  return `#${pa.map((v, i) => toHex(v * t + pb[i]! * (1 - t))).join("")}`;
}

/** "#rrggbb" + alpha -> "rgba(...)" (for canvas). */
export function withAlpha(hex: string, alpha: number): string {
  const p = parseHex(hex);
  return p ? `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${alpha})` : hex;
}
