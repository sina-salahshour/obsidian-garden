// Site-wide settings (client + server safe), aggregated from the vault's `site:` notes by the sync into
// the committed content/site.json. A missing or partial file falls back to the defaults below. The
// absolute origin is resolved on the server (site-url.server.ts: SITE_URL > site.url > Vercel > request).
import { z } from "zod";
import type { SiteAuthor, SiteData } from "./content/types.ts";
import { slugifySegment } from "./content/slug.ts";

export type { SiteAuthor, SiteData };

const DEFAULT_TITLE = "Obsidian Garden";
const DEFAULT_DESCRIPTION =
  "Notes, deep dives and explainers, published straight from my Obsidian vault.";

const strList = z.array(z.string()).catch([]).default([]);
const nullableStr = z.string().nullable().catch(null).default(null);

const authorSchema = z.object({
  id: z.string().default(""),
  name: z.string().min(1),
  aliases: strList,
  description: z.string().catch("").default(""),
  url: nullableStr,
  image: nullableStr,
  sameAs: strList,
  twitter: nullableStr,
  jobTitle: nullableStr,
});

const siteSchema = z.object({
  title: z.string().min(1).catch(DEFAULT_TITLE).default(DEFAULT_TITLE),
  description: z.string().min(1).catch(DEFAULT_DESCRIPTION).default(DEFAULT_DESCRIPTION),
  locale: z.string().min(1).catch("en").default("en"),
  url: nullableStr,
  image: nullableStr,
  keywords: strList,
  twitter: nullableStr,
  blockCrawlers: strList,
  authors: z
    .array(z.unknown())
    .catch([])
    .default([])
    // drop invalid entries instead of failing the whole file
    .transform((list) =>
      list.flatMap((a) => {
        const parsed = authorSchema.safeParse(a);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
});

/** Validates raw site.json data; every field falls back to its default. */
export function parseSiteData(raw: unknown): SiteData {
  const parsed = siteSchema.safeParse(raw ?? {});
  const data = parsed.success ? parsed.data : siteSchema.parse({});
  return {
    ...data,
    authors: data.authors.map((a) => ({ ...a, id: a.id || slugifySegment(a.name) })),
  };
}

/** A SiteAuthor with only a name (unknown author names, the fallback default author). */
export function minimalAuthor(name: string): SiteAuthor {
  return {
    id: slugifySegment(name),
    name,
    aliases: [],
    description: "",
    url: null,
    image: null,
    sameAs: [],
    twitter: null,
    jobTitle: null,
  };
}

export type Site = SiteData & {
  /** default author's name, else the site title (kept for existing consumers) */
  author: string;
  /** authors[0], else a minimal author named after the site title */
  defaultAuthor: SiteAuthor;
};

export function createSite(data: SiteData): Site {
  const defaultAuthor = data.authors[0] ?? minimalAuthor(data.title);
  return { ...data, author: defaultAuthor.name, defaultAuthor };
}

/**
 * Resolves raw author names against `authors`: matches id, name or alias case-insensitively (the
 * name's slug against ids too); unknown names become a minimal SiteAuthor; results are deduped by id;
 * an empty list resolves to [fallback].
 */
export function resolveAuthorsIn(
  authors: readonly SiteAuthor[],
  fallback: SiteAuthor,
  names: readonly string[],
): SiteAuthor[] {
  const out: SiteAuthor[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    const slug = slugifySegment(name);
    const hit =
      authors.find(
        (a) =>
          a.id === lower ||
          a.id === slug ||
          a.name.toLowerCase() === lower ||
          a.aliases.some((x) => x.toLowerCase() === lower),
      ) ?? minimalAuthor(name);
    if (!out.some((a) => a.id === hit.id)) out.push(hit);
  }
  return out.length ? out : [fallback];
}

const files = import.meta.glob<unknown>("/content/site.json", { eager: true, import: "default" });

export const site: Site = createSite(parseSiteData(files["/content/site.json"]));

/** A note's `authors` (raw names) -> SiteAuthor records; [] resolves to [site.defaultAuthor]. */
export function resolveAuthors(names: readonly string[]): SiteAuthor[] {
  return resolveAuthorsIn(site.authors, site.defaultAuthor, names);
}
