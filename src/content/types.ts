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
  /** "/attachments/<vault-relative path>" or an absolute URL; null when absent */
  cover: string | null;
  wordCount: number;
  readingMinutes: number;
  headings: Heading[];
  /** slugs of resolved outgoing [[wikilinks]] (unresolved ones are dropped), deduped */
  links: string[];
  /**
   * frontmatter `author` / `authors` as raw names (`[[Wikilink|x]]` unwrapped), trimmed, deduped; `[]`
   * when absent. Resolve them to site author records with `resolveAuthors` (site.config.ts).
   */
  authors: string[];
  /** frontmatter `social-image` ("/attachments/…" or an absolute URL), else null */
  socialImage: string | null;
  /** frontmatter `noindex: true`: still published, but robots noindex and left out of the sitemap */
  noindex: boolean;
  /** frontmatter `canonical`: absolute http(s) URL of the original (cross-posts), else null */
  canonical: string | null;
  /** frontmatter `schema` (case-insensitive), else null (the page picks a default) */
  schemaType: "Article" | "BlogPosting" | "TechArticle" | null;
  /** frontmatter `level` (case-insensitive), else null */
  level: "beginner" | "intermediate" | "advanced" | null;
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
  /** folder note's cover ("/attachments/<vault-relative path>"), else null */
  cover: string | null;
  /**
   * The cover as sanitised inline SVG markup when it is a published `.svg` (see cover-svg.ts), so it
   * draws with the site's theme tokens; null for raster/external covers or none. Only present for
   * folders the viewer may see (it comes from the same viewer-filtered index).
   */
  coverSvg: string | null;
  /** slug of the folder note (render its body as the course intro); null when the folder has none */
  indexSlug: string | null;
  /** number of parts (notes in the folder, excluding the folder note) */
  count: number;
  /** newest `date` among its notes */
  latest: string;
  /** folder note's `social-image`, else null */
  socialImage: string | null;
  /** folder note's `level`, else null */
  level: PostMeta["level"];
  /** folder note's raw `authors` (see PostMeta.authors), else [] */
  authors: string[];
  /** folder note's `noindex`, else false */
  noindex: boolean;
}

/** A Person from a `site: author` vault note (content/site.json). */
export interface SiteAuthor {
  /** slugifySegment(name) */
  id: string;
  name: string;
  aliases: string[];
  /** bio: frontmatter description, else the note's first paragraph; "" when absent */
  description: string;
  url: string | null;
  /** avatar: "/attachments/…" or an absolute URL */
  image: string | null;
  /** profile URLs (schema.org sameAs) */
  sameAs: string[];
  /** "@handle" */
  twitter: string | null;
  jobTitle: string | null;
}

export type GithubButton = "hidden" | "icon" | "stars";

/** Site-wide settings aggregated from the vault's `site:` notes by the sync (content/site.json). */
export interface SiteData {
  title: string;
  description: string;
  /** BCP-47, e.g. "en" */
  locale: string;
  /** canonical origin without a trailing slash, e.g. "https://example.com"; null when unset */
  url: string | null;
  /** default social image: "/attachments/…" or an absolute URL */
  image: string | null;
  keywords: string[];
  /** site handle, "@handle" */
  twitter: string | null;
  /** user-agent names disallowed in robots.txt */
  blockCrawlers: string[];
  /** GitHub repo URL "https://github.com/owner/repo"; null when unset */
  github: string | null;
  /** header GitHub button variant (default "icon") */
  githubButton: GithubButton;
  /** default author FIRST; [] when the vault has no author notes */
  authors: SiteAuthor[];
}

/** Who is asking. Today always anonymous unless DEV `SHOW_PRIVATE=1`; a future login sets isAdmin. */
export interface Viewer {
  isAdmin: boolean;
}
