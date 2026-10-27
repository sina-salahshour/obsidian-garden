import type { SiteAuthor } from "~/content/types";
import { absUrl, jsonLdScript, personNode, websiteNode, type JsonLdNode } from "~/lib/schema";
import { site } from "~/site.config";

type Meta = Record<string, string>;

export interface SeoInput {
  title?: string;
  description?: string;
  /** absolute site origin (from the root loader); canonical/og:url and JSON-LD are omitted without it */
  siteUrl?: string;
  /** path beginning with "/" */
  path?: string;
  /** "/attachments/x.png" or absolute URL; pick it with `socialImage()` */
  image?: string | null;
  /** og:image:alt; defaults to the page title */
  imageAlt?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string | null;
  tags?: string[];
  noindex?: boolean;
  /** absolute URL overriding the canonical / og:url (cross-posts) */
  canonical?: string | null;
  /** article:section (the course title) */
  section?: string | null;
  /** resolved authors of the page (article:author, twitter:creator, JSON-LD Person nodes) */
  authors?: SiteAuthor[];
  /** page-specific JSON-LD nodes, built once the origin is known; WebSite + Person nodes are added */
  schema?: (origin: string) => JsonLdNode[];
}

/** Read the absolute origin the root loader resolved, from a child route's head() `matches`. */
export const siteUrlFrom = (matches: readonly { loaderData?: unknown }[]) =>
  (matches[0]?.loaderData as { siteUrl?: string } | undefined)?.siteUrl;

/** Title in the site's pattern: "Page · Site" (or just the site title). */
export function pageTitle(title?: string) {
  return title ? `${title} · ${site.title}` : site.title;
}

const isSvg = (src: string) => /\.svg(?:[?#]|$)/i.test(src);

/**
 * The social card image: the first raster candidate (SVG never renders in link previews), else the
 * site default image, else /og.png. Pass candidates in priority order: socialImage, then cover.
 */
export function socialImage(...candidates: (string | null | undefined)[]): string {
  for (const c of [...candidates, site.image]) if (c && !isSvg(c)) return c;
  return "/og.png";
}

/** "en-GB" -> "en_GB", "en" -> "en_US" style Open Graph locale. */
export function ogLocale(locale: string) {
  const l = locale.replace("-", "_");
  return l === "en" ? "en_US" : l;
}

/** meta + links + JSON-LD scripts for a route's head(). */
export function seo(input: SeoInput): {
  meta: Meta[];
  links: Meta[];
  scripts: { type: string; children: string }[];
} {
  const title = pageTitle(input.title);
  const ogTitle = input.title ?? site.title;
  const description = input.description || site.description;
  const imagePath = input.image || socialImage();
  const image = input.siteUrl ? absUrl(input.siteUrl, imagePath) : imagePath;
  const authors = input.authors ?? [];
  const creator = (authors.length ? authors : [site.defaultAuthor]).find((a) => a.twitter)?.twitter;
  const meta: Meta[] = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: ogTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: input.type ?? "website" },
    { property: "og:locale", content: ogLocale(site.locale) },
    { property: "og:image", content: image },
    { property: "og:image:alt", content: input.imageAlt ?? ogTitle },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: ogTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: input.imageAlt ?? ogTitle },
  ];
  if (site.twitter) meta.push({ name: "twitter:site", content: site.twitter });
  if (creator) meta.push({ name: "twitter:creator", content: creator });
  if (site.keywords.length) meta.push({ name: "keywords", content: site.keywords.join(", ") });

  const links: Meta[] = [];
  const url =
    input.canonical || (input.siteUrl && input.path ? absUrl(input.siteUrl, input.path) : "");
  if (url) {
    meta.push({ property: "og:url", content: url });
    links.push({ rel: "canonical", href: url });
  }
  if (input.type === "article") {
    if (input.publishedTime)
      meta.push({ property: "article:published_time", content: input.publishedTime });
    if (input.modifiedTime)
      meta.push({ property: "article:modified_time", content: input.modifiedTime });
    if (input.section) meta.push({ property: "article:section", content: input.section });
    for (const a of authors.length ? authors : [site.defaultAuthor])
      meta.push({ property: "article:author", content: a.url ?? a.name });
    for (const t of input.tags ?? []) meta.push({ property: "article:tag", content: t });
  }
  meta.push({
    name: "robots",
    content: input.noindex ? "noindex, follow" : "index, follow, max-image-preview:large",
  });

  const scripts = [];
  if (input.siteUrl) {
    const origin = input.siteUrl;
    scripts.push(
      jsonLdScript([
        websiteNode(origin, site),
        ...[site.defaultAuthor, ...authors].map((a) => personNode(origin, a)),
        ...(input.schema?.(origin) ?? []),
      ]),
    );
  }
  return { meta, links, scripts };
}
