// Pure content index: lists, series, tags, folders, graph, related, backlinks and search over a set of
// notes that the caller has ALREADY filtered for the viewer (see posts.server.ts). Anything not in the
// set (e.g. private notes for anonymous viewers) is invisible: links to it are dropped everywhere.
import type {
  FolderInfo,
  GraphData,
  PostDetail,
  PostListResult,
  PostMeta,
  PostSort,
  SearchHit,
  TagCount,
} from "./types.ts";
import { slugifySegment } from "./slug.ts";

export interface IndexedPost {
  meta: PostMeta;
  /** plain text body (server-only) */
  text: string;
}

export interface ListOptions {
  tag?: string;
  folder?: string;
  sort?: PostSort;
  page?: number;
  pageSize?: number;
}

export interface ContentIndex {
  /** every note in the set, newest first (folder notes included) */
  all: PostMeta[];
  get(slug: string): PostMeta | undefined;
  list(options?: ListOptions): PostListResult;
  detail(slug: string): PostDetail | null;
  related(slug: string, limit?: number): PostMeta[];
  backlinks(slug: string): PostMeta[];
  tags(): TagCount[];
  folders(): FolderInfo[];
  /** parts of a folder (folder SLUG), ordered by `order` then title; null when the folder is unknown */
  series(folderSlug: string): PostMeta[] | null;
  search(q: string, options?: { tag?: string; limit?: number }): SearchHit[];
  graph(): GraphData;
}

const byTitle = (a: PostMeta, b: PostMeta) =>
  a.title.localeCompare(b.title, "en", { sensitivity: "base" });

export const newestFirst = (a: PostMeta, b: PostMeta) =>
  b.date.localeCompare(a.date) || (a.order ?? Infinity) - (b.order ?? Infinity) || byTitle(a, b);

const bySeriesOrder = (a: PostMeta, b: PostMeta) =>
  (a.order ?? Infinity) - (b.order ?? Infinity) || byTitle(a, b);

export function humanizeFolder(folder: string): string {
  return folder
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function folderSlug(folder: string): string {
  return slugifySegment(folder);
}

// ---------------------------------------------------------------------------------------------
// Search

export function tokenize(q: string): string[] {
  return [
    ...new Set(
      q
        .toLowerCase()
        .split(/[^\p{L}\p{N}_$.#-]+/u)
        .map((t) => t.replace(/^[.#-]+|[.-]+$/g, ""))
        .filter(Boolean),
    ),
  ];
}

function occurrences(haystackLower: string, token: string, max = Infinity): number[] {
  const out: number[] = [];
  let i = haystackLower.indexOf(token);
  while (i !== -1 && out.length < max) {
    out.push(i);
    i = haystackLower.indexOf(token, i + token.length);
  }
  return out;
}

const EXCERPT = 160;

/** ~160-char excerpt around the first match of any token, with highlight ranges. */
export function makeExcerpt(
  text: string,
  tokens: string[],
  size = EXCERPT,
): { excerpt: string; ranges: [number, number][] } | null {
  const clean = text.replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  let first = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && (first === -1 || i < first)) first = i;
  }
  if (first === -1) return null;
  let start = Math.max(0, first - Math.floor(size / 3));
  if (start > 0) {
    const space = clean.lastIndexOf(" ", start);
    start = space === -1 || first - space > size / 2 ? start : space + 1;
  }
  let end = Math.min(clean.length, start + size);
  if (end < clean.length) {
    const space = clean.lastIndexOf(" ", end);
    if (space > first) end = space;
  }
  const prefix = start > 0 ? "…" : "";
  const suffix = end < clean.length ? "…" : "";
  const body = clean.slice(start, end);
  const excerpt = `${prefix}${body}${suffix}`;
  const ranges = rangesIn(excerpt, tokens);
  return { excerpt, ranges };
}

export function rangesIn(value: string, tokens: string[]): [number, number][] {
  const lower = value.toLowerCase();
  const raw: [number, number][] = [];
  for (const t of tokens) for (const i of occurrences(lower, t)) raw.push([i, i + t.length]);
  raw.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

const wordStart = (lower: string, i: number) => i === 0 || !/[\p{L}\p{N}]/u.test(lower[i - 1]!);

/**
 * Score: every token must match somewhere (AND). Title match 10 (+5 at a word start), exact tag 8 /
 * partial tag 4, heading 4, body 1 per occurrence (max 5); whole query inside the title +15.
 */
export function scorePost(
  post: IndexedPost,
  tokens: string[],
  phrase: string,
  bodyLower: string,
): number {
  const title = post.meta.title.toLowerCase();
  const headings = post.meta.headings.map((h) => h.text.toLowerCase());
  let score = 0;
  for (const t of tokens) {
    let s = 0;
    const ti = title.indexOf(t);
    if (ti !== -1) s += 10 + (wordStart(title, ti) ? 5 : 0);
    if (post.meta.tags.includes(t)) s += 8;
    else if (post.meta.tags.some((tag) => tag.includes(t))) s += 4;
    if (headings.some((h) => h.includes(t))) s += 4;
    if (post.meta.description.toLowerCase().includes(t)) s += 2;
    s += occurrences(bodyLower, t, 5).length;
    if (s === 0) return 0;
    score += s;
  }
  if (tokens.length > 1 && title.includes(phrase)) score += 15;
  return score;
}

// ---------------------------------------------------------------------------------------------

export interface IndexOptions {
  /** cover href ("/attachments/…") -> sanitised inline SVG, built at build time (posts.server.ts) */
  coverSvgs?: ReadonlyMap<string, string>;
}

export function createIndex(
  posts: readonly IndexedPost[],
  { coverSvgs }: IndexOptions = {},
): ContentIndex {
  const svgFor = (cover: string | null) => (cover && coverSvgs?.get(cover)) || null;
  const all = posts.map((p) => p.meta).sort(newestFirst);
  const bySlug = new Map(all.map((m) => [m.slug, m]));
  const textBySlug = new Map(posts.map((p) => [p.meta.slug, p.text]));
  const lowerBySlug = new Map(posts.map((p) => [p.meta.slug, p.text.toLowerCase()]));
  /** notes that appear in lists, tag counts and RSS: everything except folder (course) notes */
  const listed = all.filter((m) => !m.isFolderNote);

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, Set<string>>();
  for (const m of all) {
    const targets = m.links.filter((l) => bySlug.has(l) && l !== m.slug);
    outgoing.set(m.slug, targets);
    for (const t of targets) {
      if (!incoming.has(t)) incoming.set(t, new Set());
      incoming.get(t)!.add(m.slug);
    }
  }

  const folderParts = new Map<string, PostMeta[]>();
  for (const m of listed) {
    if (!m.folder) continue;
    const key = folderSlug(m.folder);
    folderParts.set(key, [...(folderParts.get(key) ?? []), m]);
  }
  for (const parts of folderParts.values()) parts.sort(bySeriesOrder);
  const folderNotes = new Map(
    all
      .filter((m) => m.isFolderNote && m.folder && m.slug === folderSlug(m.folder))
      .map((m) => [m.slug, m]),
  );

  const backlinks = (slug: string) =>
    [...(incoming.get(slug) ?? [])]
      .map((s) => bySlug.get(s)!)
      .filter(Boolean)
      .sort(newestFirst);

  const neighbours = (meta: PostMeta): { prev: PostMeta | null; next: PostMeta | null } => {
    if (meta.isFolderNote) return { prev: null, next: null };
    const pool =
      meta.folder !== null
        ? (folderParts.get(folderSlug(meta.folder)) ?? [])
        : listed.filter((m) => m.folder === null);
    const ordered =
      meta.order !== null
        ? pool.filter((m) => m.order !== null).sort(bySeriesOrder)
        : [...pool].sort((a, b) => a.date.localeCompare(b.date) || byTitle(a, b));
    const i = ordered.findIndex((m) => m.slug === meta.slug);
    if (i === -1) return { prev: null, next: null };
    return { prev: ordered[i - 1] ?? null, next: ordered[i + 1] ?? null };
  };

  // tag document frequency for related-post weighting
  const df = new Map<string, number>();
  for (const m of listed) for (const t of m.tags) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log(1 + listed.length / (df.get(t) ?? 1));

  const index: ContentIndex = {
    all,
    get: (slug) => bySlug.get(slug),

    list({ tag, folder, sort = "newest", page = 1, pageSize = 12 } = {}) {
      let posts = listed;
      if (tag) {
        const t = tag.toLowerCase().replace(/^#/, "");
        posts = posts.filter((m) => m.tags.includes(t));
      }
      if (folder)
        posts = posts.filter(
          (m) => m.folder !== null && (m.folder === folder || folderSlug(m.folder) === folder),
        );
      posts =
        sort === "oldest"
          ? [...posts].sort((a, b) => -newestFirst(a, b))
          : sort === "title"
            ? [...posts].sort(byTitle)
            : posts;
      const size = Math.max(1, Math.min(100, Math.floor(pageSize)));
      const pageCount = Math.max(1, Math.ceil(posts.length / size));
      const current = Math.min(Math.max(1, Math.floor(page)), pageCount);
      return {
        posts: posts.slice((current - 1) * size, current * size),
        total: posts.length,
        page: current,
        pageCount,
      };
    },

    detail(slug) {
      const meta = bySlug.get(slug);
      if (!meta) return null;
      return { meta, ...neighbours(meta), backlinks: backlinks(slug) };
    },

    backlinks,

    related(slug, limit = 3) {
      const meta = bySlug.get(slug);
      if (!meta) return [];
      const out = new Set(outgoing.get(slug) ?? []);
      const inc = incoming.get(slug) ?? new Set<string>();
      return listed
        .filter((m) => m.slug !== slug)
        .map((m) => {
          let score = 0;
          for (const t of m.tags) if (meta.tags.includes(t)) score += idf(t);
          if (out.has(m.slug)) score += 3;
          if (inc.has(m.slug)) score += 2;
          if (meta.folder !== null && m.folder === meta.folder) score += 0.5;
          return { m, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score || newestFirst(a.m, b.m))
        .slice(0, Math.max(0, limit))
        .map((r) => r.m);
    },

    tags() {
      const counts = new Map<string, number>();
      for (const m of listed) for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      return [...counts]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    },

    folders() {
      const out: FolderInfo[] = [];
      for (const [slug, parts] of folderParts) {
        const folder = parts[0]!.folder!;
        const note = folderNotes.get(slug) ?? null;
        const moc =
          parts.find((m) => m.order === 0) ?? parts.find((m) => m.tags.includes("moc")) ?? null;
        const dates = [...parts, ...(note ? [note] : [])].map((m) => m.date).sort();
        out.push({
          folder,
          slug,
          title: note?.title ?? moc?.title ?? humanizeFolder(folder),
          description: note?.description ?? "",
          cover: note?.cover ?? null,
          coverSvg: svgFor(note?.cover ?? null),
          indexSlug: note?.slug ?? null,
          count: parts.length,
          latest: dates[dates.length - 1]!,
        });
      }
      // folders that only have a folder note (no parts yet)
      for (const [slug, note] of folderNotes) {
        if (folderParts.has(slug)) continue;
        out.push({
          folder: note.folder!,
          slug,
          title: note.title,
          description: note.description,
          cover: note.cover,
          coverSvg: svgFor(note.cover),
          indexSlug: note.slug,
          count: 0,
          latest: note.date,
        });
      }
      return out.sort((a, b) => b.latest.localeCompare(a.latest) || a.title.localeCompare(b.title));
    },

    series(slug) {
      const parts = folderParts.get(slug);
      if (parts) return parts;
      return folderNotes.has(slug) ? [] : null;
    },

    search(q, { tag, limit = 20 } = {}) {
      const tokens = tokenize(q);
      if (tokens.length === 0) return [];
      const phrase = q.trim().toLowerCase();
      const t = tag?.toLowerCase().replace(/^#/, "");
      const hits: SearchHit[] = [];
      for (const meta of all) {
        if (t && !meta.tags.includes(t)) continue;
        const post = { meta, text: textBySlug.get(meta.slug) ?? "" };
        const score = scorePost(post, tokens, phrase, lowerBySlug.get(meta.slug) ?? "");
        if (score <= 0) continue;
        const ex = makeExcerpt(post.text, tokens) ?? {
          excerpt: meta.description,
          ranges: rangesIn(meta.description, tokens),
        };
        hits.push({
          slug: meta.slug,
          title: meta.title,
          excerpt: ex.excerpt,
          ranges: ex.ranges,
          tags: meta.tags,
          visibility: meta.visibility,
          score,
        });
      }
      return hits
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, Math.max(0, limit));
    },

    graph() {
      const seen = new Set<string>();
      const links: GraphData["links"] = [];
      const degree = new Map<string, number>();
      for (const [source, targets] of outgoing) {
        for (const target of targets) {
          const key = `${source}\u0000${target}`;
          if (seen.has(key)) continue;
          seen.add(key);
          links.push({ source, target });
          degree.set(source, (degree.get(source) ?? 0) + 1);
          degree.set(target, (degree.get(target) ?? 0) + 1);
        }
      }
      return {
        nodes: all.map((m) => ({
          id: m.slug,
          title: m.title,
          tags: m.tags,
          degree: degree.get(m.slug) ?? 0,
          folder: m.folder,
          isFolderNote: m.isFolderNote,
        })),
        links,
      };
    },
  };
  return index;
}
