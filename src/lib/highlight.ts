export type Segment = { text: string; hit: boolean };

/**
 * Split `text` into plain/highlighted segments from [start, end) ranges.
 * Ranges may be unsorted, overlapping or out of bounds; they are clamped and merged.
 */
export function splitRanges(
  text: string,
  ranges: readonly (readonly [number, number])[],
): Segment[] {
  const clean = ranges
    .map(
      ([s, e]) =>
        [Math.max(0, Math.min(s, text.length)), Math.max(0, Math.min(e, text.length))] as const,
    )
    .filter(([s, e]) => e > s)
    .toSorted((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of clean) {
    const last = merged.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const out: Segment[] = [];
  let i = 0;
  for (const [s, e] of merged) {
    if (s > i) out.push({ text: text.slice(i, s), hit: false });
    out.push({ text: text.slice(s, e), hit: true });
    i = e;
  }
  if (i < text.length) out.push({ text: text.slice(i), hit: false });
  return out;
}

/** Case-insensitive ranges of every query term (>= 2 chars) inside `text`. */
export function findRanges(text: string, query: string): [number, number][] {
  const terms = [
    ...new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 2),
    ),
  ];
  if (!terms.length) return [];
  const hay = text.toLowerCase();
  const out: [number, number][] = [];
  for (const t of terms) {
    let at = hay.indexOf(t);
    while (at !== -1) {
      out.push([at, at + t.length]);
      at = hay.indexOf(t, at + t.length);
    }
  }
  return out;
}
