// Shared content contract. Owned by the architect; change only by agreement.

export interface Heading {
  depth: 2 | 3 | 4;
  text: string;
  /** rehype-slug id, used for #anchors and the table of contents */
  id: string;
}

/** Computed at build time by the remark meta plugin, exported from every note module as `meta`. */
export interface PostMeta {
  /** URL path segment(s) after /posts/, lowercase kebab, folders kept: "react-explain/use-effect" */
  slug: string;
  title: string;
  /** frontmatter.description, else the first paragraph trimmed to ~180 chars */
  description: string;
  /** ISO 8601 date: frontmatter date|created, else the vault file's mtime injected by the sync script */
  date: string;
  /** ISO 8601, frontmatter updated|modified; null when absent */
  updated: string | null;
  /** lowercase, without "#", frontmatter tags + inline #tags, deduped, sorted */
  tags: string[];
  /** top-level vault folder (original name, e.g. "react-explain"), null for notes at the vault root */
  folder: string | null;
  /** numeric filename prefix ("07 beginWork…" -> 7) = position in the folder's series; null when absent */
  order: number | null;
  /** frontmatter aliases (wikilinks may target them) */
  aliases: string[];
  /**
   * "private" when frontmatter `visibility: private` or `private: true` (or tag #private).
   * Private notes are built but only served to viewers allowed by `canViewPrivate` (admin, later);
   * everyone else gets 404 and never sees them in lists, search, graph, RSS, sitemap or backlinks.
   * (`publish: false` / `draft: true` notes are never synced at all.)
   */
  visibility: "public" | "private";
  /**
   * true for a folder's main "course" note: `<dir>/<dir>.md`, `<dir>.md` next to `<dir>/`, or `<dir>/index.md`.
   * Its slug is the folder slug ("react-explain"); it is not counted as a part of the series.
   */
  isFolderNote: boolean;
  /** original vault-relative path without extension, e.g. "react-explain/07 beginWork and Reconciliation" */
  source: string;
  /** "/attachments/<file>" or an absolute URL; null when absent */
  cover: string | null;
  wordCount: number;
  readingMinutes: number;
  headings: Heading[];
  /** slugs of resolved outgoing [[wikilinks]] (unresolved ones are dropped), deduped */
  links: string[];
}

export type PostSort = "newest" | "oldest" | "title";

export interface PostListResult {
  posts: PostMeta[];
  total: number;
  page: number;
  pageCount: number;
}

export interface PostDetail {
  meta: PostMeta;
  /** series neighbours: by `order` within the same folder when the note has one, else by date (prev = older) */
  prev: PostMeta | null;
  next: PostMeta | null;
  backlinks: PostMeta[];
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface SearchHit {
  slug: string;
  title: string;
  /** plain-text excerpt around the first match, ~160 chars */
  excerpt: string;
  /** [start, end) character ranges inside `excerpt` to highlight */
  ranges: [number, number][];
  tags: string[];
  visibility: PostMeta["visibility"];
  score: number;
}

export interface GraphData {
  nodes: {
    id: string;
    title: string;
    tags: string[];
    degree: number;
    folder: string | null;
    /** a course's main note (series starting point); link to /series/<id>, not /posts/<id> */
    isFolderNote: boolean;
  }[];
  links: { source: string; target: string }[];
}

/** A top-level vault folder shown as a series ("react-explain" -> 18 ordered notes). */
export interface FolderInfo {
  folder: string;
  /** folder slug, used in /series/$folder */
  slug: string;
  /** folder note's title, else the order-0 / #moc note's title, else the humanized folder name */
  title: string;
  /** folder note description (frontmatter or first paragraph), else "" */
  description: string;
  /** folder note's cover ("/attachments/<file>"), else null */
  cover: string | null;
  /** slug of the folder note (render its body as the course intro); null when the folder has none */
  indexSlug: string | null;
  /** number of parts (notes in the folder, excluding the folder note) */
  count: number;
  /** newest `date` among its notes */
  latest: string;
}

/** Who is asking. Today always anonymous unless DEV `SHOW_PRIVATE=1`; a future login sets isAdmin. */
export interface Viewer {
  isAdmin: boolean;
}
