// Obsidian-like attachment resolution shared by the sync script (Node type stripping: erasable TS,
// no imports except relative .ts) and the build-time MDX plugins. Attachments are published at
// public/attachments/<vault-relative path>, so every folder can have its own `cover.svg`.
import { baseOf, dirOf } from "./paths.ts";

export interface AttachmentResolution {
  /** vault-relative path of the resolved attachment, or null when nothing matches */
  path: string | null;
  /** other candidates when a bare file name matched several attachments (the sync warns) */
  ambiguous: string[];
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** `![[a/b.png|300]]`, `b.png#x`, `./b%20c.png` -> `a/b.png`, `b.png`, `b c.png`. */
export function cleanAttachmentRef(ref: string): string {
  let t = ref.trim();
  const wiki = /^!?\[\[([\s\S]*?)\]\]$/.exec(t);
  if (wiki) t = wiki[1]!;
  t = t.replace(/\\\|/g, "|");
  t = t.split("|")[0]!.split("#")[0]!;
  t = safeDecode(t.trim()).replace(/\\/g, "/");
  while (t.startsWith("./")) t = t.slice(2);
  return t.trim();
}

/** Resolves `.` / `..` segments; null when the path climbs above the vault root. */
function normalize(path: string): string | null {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (!out.length) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.join("/");
}

interface Index {
  /** lowercase path -> actual path */
  byPath: Map<string, string>;
  /** lowercase basename -> actual paths */
  byBase: Map<string, string[]>;
}

const indexes = new WeakMap<ReadonlySet<string>, Index>();

function indexOf(attachments: ReadonlySet<string>): Index {
  const cached = indexes.get(attachments);
  if (cached) return cached;
  const index: Index = { byPath: new Map(), byBase: new Map() };
  for (const a of attachments) {
    const lower = a.toLowerCase();
    if (!index.byPath.has(lower) || a === lower) index.byPath.set(lower, a);
    const base = baseOf(lower);
    index.byBase.set(base, [...(index.byBase.get(base) ?? []), a]);
  }
  indexes.set(attachments, index);
  return index;
}

function lookup(path: string, attachments: ReadonlySet<string>, index: Index): string | null {
  if (attachments.has(path)) return path;
  return index.byPath.get(path.toLowerCase()) ?? null;
}

function sharedSegments(a: string, b: string): number {
  const x = a ? a.split("/") : [];
  const y = b ? b.split("/") : [];
  let n = 0;
  while (n < x.length && n < y.length && x[n]!.toLowerCase() === y[n]!.toLowerCase()) n += 1;
  return n;
}

/** Several candidates: longest shared directory prefix with the note, then shortest, then alphabetical. */
function pick(candidates: string[], noteDir: string): AttachmentResolution {
  const sorted = [...candidates].sort(
    (a, b) =>
      sharedSegments(dirOf(b), noteDir) - sharedSegments(dirOf(a), noteDir) ||
      a.length - b.length ||
      a.localeCompare(b),
  );
  return { path: sorted[0]!, ambiguous: sorted.slice(1) };
}

/**
 * Resolves an attachment reference from a note like Obsidian does. `noteDir` is the note's LOGICAL
 * vault-relative directory ("" = vault root); `attachments` holds vault-relative attachment paths.
 *   - a ref with "/": relative to the note (`..` allowed), then from the vault root, then the
 *     unique attachment whose path ends with it.
 *   - a bare name: same folder, then the nearest ancestor folder, then a unique name anywhere,
 *     else the candidate closest to the note (the others are returned in `ambiguous`).
 */
export function resolveAttachment(
  ref: string,
  noteDir: string,
  attachments: ReadonlySet<string>,
): AttachmentResolution {
  const none: AttachmentResolution = { path: null, ambiguous: [] };
  const target = cleanAttachmentRef(ref);
  if (!target) return none;
  const index = indexOf(attachments);
  const dir = normalize(noteDir) ?? "";

  if (target.includes("/")) {
    const rooted = target.startsWith("/");
    const relative = rooted ? null : normalize(dir ? `${dir}/${target}` : target);
    const fromRoot = normalize(target);
    for (const p of [relative, fromRoot]) {
      const hit = p ? lookup(p, attachments, index) : null;
      if (hit) return { path: hit, ambiguous: [] };
    }
    if (fromRoot === null) return none;
    const suffix = `/${fromRoot.toLowerCase()}`;
    const matches = (index.byBase.get(baseOf(fromRoot).toLowerCase()) ?? []).filter((a) =>
      `/${a.toLowerCase()}`.endsWith(suffix),
    );
    if (matches.length === 0) return none;
    return matches.length === 1 ? { path: matches[0]!, ambiguous: [] } : pick(matches, dir);
  }

  // Same folder, then each ancestor up to the vault root.
  let d: string | null = dir;
  while (d !== null) {
    const hit = lookup(d ? `${d}/${target}` : target, attachments, index);
    if (hit) return { path: hit, ambiguous: [] };
    d = d ? dirOf(d) : null;
  }
  const candidates = index.byBase.get(target.toLowerCase()) ?? [];
  if (candidates.length === 0) return none;
  if (candidates.length === 1) return { path: candidates[0]!, ambiguous: [] };
  return pick(candidates, dir);
}

/** Public URL of a vault-relative attachment path: `/attachments/` + encoded segments. */
export function attachmentHref(path: string): string {
  return `/attachments/${path.split("/").map(encodeURIComponent).join("/")}`;
}
