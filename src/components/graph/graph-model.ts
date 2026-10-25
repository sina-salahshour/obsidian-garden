import type { GraphData } from "~/content/types";

export interface GraphGroup {
  id: string;
  label: string;
  /** CSS custom property the colour comes from */
  token: string;
  count: number;
}

/** Cool categorical palette for note groups; the warm token is reserved for series starts. */
export const GROUP_TOKENS = [
  "--accent",
  "--c-tip",
  "--c-note",
  "--c-example",
  "--c-success",
  "--c-failure",
  "--c-question",
];
export const START = "__start";
export const START_TOKEN = "--warm";
export const OTHER = "__other";
const MAX_GROUPS = 6;

const humanize = (s: string) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Colour groups for the graph. Series starts (folder notes) always form their own warm group.
 * Several top-level folders -> group by folder. One folder (a single series) -> group by each
 * note's most distinctive shared tag, ignoring tags almost every note has.
 */
export function computeGroups(nodes: GraphData["nodes"]): {
  groups: GraphGroup[];
  groupOf: Map<string, string>;
} {
  const groupOf = new Map<string, string>();
  const parts = nodes.filter((n) => !n.isFolderNote);
  const folders = new Set(parts.map((n) => n.folder ?? "(root)"));
  let key: (n: GraphData["nodes"][number]) => string | null;
  let label: (k: string) => string;

  if (folders.size > 1) {
    key = (n) => n.folder ?? "(root)";
    label = (k) => (k === "(root)" ? "Loose notes" : humanize(k));
  } else {
    const freq = new Map<string, number>();
    for (const n of parts) for (const t of n.tags) freq.set(t, (freq.get(t) ?? 0) + 1);
    const tooCommon = (t: string) => (freq.get(t) ?? 0) > parts.length * 0.6;
    key = (n) =>
      n.tags
        .filter((t) => !tooCommon(t) && (freq.get(t) ?? 0) >= 2)
        .toSorted((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0) || a.localeCompare(b))[0] ??
      null;
    label = (k) => `#${k}`;
  }

  const counts = new Map<string, number>();
  for (const n of parts) {
    const k = key(n);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const top = [...counts]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_GROUPS);
  const kept = new Set(top.map(([k]) => k));
  const groups: GraphGroup[] = top.map(([k, count], i) => ({
    id: k,
    label: label(k),
    token: GROUP_TOKENS[i % GROUP_TOKENS.length]!,
    count,
  }));
  let other = 0;
  let starts = 0;
  for (const n of nodes) {
    if (n.isFolderNote) {
      groupOf.set(n.id, START);
      starts++;
      continue;
    }
    const k = key(n);
    if (k && kept.has(k)) groupOf.set(n.id, k);
    else {
      groupOf.set(n.id, OTHER);
      other++;
    }
  }
  if (other) groups.push({ id: OTHER, label: "Other", token: "--subtle", count: other });
  if (starts)
    groups.unshift({ id: START, label: "Series start", token: START_TOKEN, count: starts });
  return { groups, groupOf };
}

/** Tapered quadratic edge as a closed polygon: `w0` wide at the source, `w1` at the target. */
export function taperedEdge(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  w0: number,
  w1: number,
  bend = 0.12,
): { c: [number, number]; pts: number[] } {
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = (sx + tx) / 2 + nx * len * bend;
  const cy = (sy + ty) / 2 + ny * len * bend;
  const wm = (w0 + w1) / 2;
  // [moveTo, quad ctrl, quad end, lineTo, quad ctrl, quad end]
  return {
    c: [cx, cy],
    pts: [
      sx + nx * w0,
      sy + ny * w0,
      cx + nx * wm,
      cy + ny * wm,
      tx + nx * w1,
      ty + ny * w1,
      tx - nx * w1,
      ty - ny * w1,
      cx - nx * wm,
      cy - ny * wm,
      sx - nx * w0,
      sy - ny * w0,
    ],
  };
}
