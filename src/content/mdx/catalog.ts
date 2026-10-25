// Build-time note catalog (Node only): every note in content/ with its slug, href, title, aliases and
// visibility, used to resolve [[wikilinks]] and ![[embeds]]. Read from disk at compile time.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { baseOf, isPrivateContentPath, stripNoteExt, stripOrderPrefix } from "../paths.ts";
import { slugEntries } from "../slug.ts";

export interface CatalogEntry {
  /** content-relative path with extension (may start with `_private/`) */
  contentPath: string;
  /** vault-relative path with extension */
  logical: string;
  slug: string;
  /** "/posts/<slug>", or "/series/<slug>" for a top-level folder note */
  href: string;
  title: string;
  aliases: string[];
  isPrivate: boolean;
  folderDir: string | null;
}

export interface Catalog {
  entries: CatalogEntry[];
  byContentPath: Map<string, CatalogEntry>;
  /** resolves an Obsidian link target ("Note", "folder/Note", "Note.md", an alias), case-insensitive */
  resolve(target: string): CatalogEntry | null;
}

export interface CatalogSource {
  /** content-relative path with extension */
  path: string;
  source: string;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;

export function readFrontmatter(source: string): { data: Record<string, unknown>; body: string } {
  const m = FM_RE.exec(source);
  if (!m) return { data: {}, body: source };
  try {
    const parsed: unknown = parseYaml(m[1] ?? "");
    const data =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    return { data, body: source.slice(m[0].length) };
  } catch {
    return { data: {}, body: source.slice(m[0].length) };
  }
}

export function toStringList(value: unknown): string[] {
  if (Array.isArray(value))
    return value
      .filter((v) => v != null)
      .map((v) => String(v).trim())
      .filter(Boolean);
  if (typeof value === "string")
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  return [];
}

/** Plain text of a markdown heading line (inline markup removed). */
export function plainInline(md: string): string {
  return md
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t: string, a?: string) => a ?? t)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]|==/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** First `# H1` outside fenced code. */
export function firstH1(body: string): string | null {
  let fence: string | null = null;
  for (const line of body.split("\n")) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (f[1]!.startsWith(fence)) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const h = /^#[ \t]+(.+?)[ \t#]*$/.exec(line);
    if (h) return plainInline(h[1]!);
  }
  return null;
}

export function noteTitle(data: Record<string, unknown>, body: string, logical: string): string {
  if (typeof data.title === "string" && data.title.trim()) return data.title.trim();
  return firstH1(body) ?? stripOrderPrefix(stripNoteExt(baseOf(logical)));
}

export function buildCatalog(sources: readonly CatalogSource[]): Catalog {
  const sorted = [...sources].sort((a, b) => a.path.localeCompare(b.path));
  const slugs = slugEntries(sorted.map((s) => s.path));
  const entries: CatalogEntry[] = sorted.map((s, i) => {
    const { data, body } = readFrontmatter(s.source);
    const se = slugs[i]!;
    const topLevelFolderNote = se.folderDir !== null && !se.folderDir.includes("/");
    return {
      contentPath: s.path,
      logical: se.logical,
      slug: se.slug,
      href: topLevelFolderNote ? `/series/${se.slug}` : `/posts/${se.slug}`,
      title: noteTitle(data, body, se.logical),
      aliases: toStringList(data.aliases ?? data.alias),
      isPrivate: isPrivateContentPath(s.path),
      folderDir: se.folderDir,
    };
  });
  const byContentPath = new Map(entries.map((e) => [e.contentPath, e]));
  const byPath = new Map<string, CatalogEntry>();
  const byBase = new Map<string, CatalogEntry>();
  const byAlias = new Map<string, CatalogEntry>();
  for (const e of entries) {
    const noExt = stripNoteExt(e.logical).toLowerCase();
    if (!byPath.has(noExt)) byPath.set(noExt, e);
    const base = baseOf(noExt);
    if (!byBase.has(base)) byBase.set(base, e);
    for (const a of e.aliases) if (!byAlias.has(a.toLowerCase())) byAlias.set(a.toLowerCase(), e);
  }
  const resolve = (target: string): CatalogEntry | null => {
    const t = stripNoteExt(
      target
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.?\//, ""),
    ).toLowerCase();
    if (!t) return null;
    const exact = byPath.get(t);
    if (exact) return exact;
    if (t.includes("/")) {
      const suffix = entries.find((e) => stripNoteExt(e.logical).toLowerCase().endsWith(`/${t}`));
      if (suffix) return suffix;
    }
    return byBase.get(baseOf(t)) ?? byAlias.get(t) ?? null;
  };
  return { entries, byContentPath, resolve };
}

function listNotes(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let items;
    try {
      items = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const abs = join(d, item.name);
      if (item.isDirectory()) walk(abs);
      else if (/\.mdx?$/i.test(item.name)) out.push(relative(dir, abs).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

const cache = new Map<string, { signature: string; catalog: Catalog }>();

/** Catalog of `contentDir`, rebuilt only when a note was added, removed or modified. */
export function loadCatalog(contentDir: string): Catalog {
  const files = listNotes(contentDir);
  const signature = files.map((f) => `${f}:${statSync(join(contentDir, f)).mtimeMs}`).join("|");
  const hit = cache.get(contentDir);
  if (hit && hit.signature === signature) return hit.catalog;
  const catalog = buildCatalog(
    files.map((path) => ({ path, source: readFileSync(join(contentDir, path), "utf8") })),
  );
  cache.set(contentDir, { signature, catalog });
  return catalog;
}
