// Pure schema.org JSON-LD builders. Every page emits ONE <script type="application/ld+json"> holding an
// `@graph`; nodes reference each other by `@id` (`${origin}/#website`, `${origin}/#/author/<id>`,
// `${origin}/series/<slug>#course`). No site config is read here: callers pass everything in.
import type { PostMeta, SiteAuthor } from "~/content/types";

export type JsonLdNode = Record<string, unknown>;

export interface Crumb {
  name: string;
  /** path beginning with "/" (or an absolute URL) */
  path: string;
}

/** Absolute URL for a path on `origin`; absolute URLs pass through. */
export const absUrl = (origin: string, path: string) =>
  /^https?:\/\//.test(path) ? path : `${origin.replace(/\/+$/, "")}${path}`;

export const ids = {
  website: (origin: string) => `${absUrl(origin, "/")}#website`,
  author: (origin: string, id: string) => absUrl(origin, `/#/author/${id}`),
  course: (origin: string, slug: string) => absUrl(origin, `/series/${slug}#course`),
};

const ref = (id: string) => ({ "@id": id });

/** Drop null/undefined values, empty strings and empty arrays so the graph stays lean. */
function compact(node: JsonLdNode): JsonLdNode {
  return Object.fromEntries(
    Object.entries(node).filter(
      ([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0),
    ),
  );
}

/** ISO 8601 duration in whole minutes: 12 -> "PT12M". */
export const minutesDuration = (minutes: number) => `PT${Math.max(1, Math.round(minutes))}M`;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function websiteNode(
  origin: string,
  site: { title: string; description: string; locale: string; defaultAuthor: SiteAuthor },
): JsonLdNode {
  return compact({
    "@type": "WebSite",
    "@id": ids.website(origin),
    name: site.title,
    description: site.description,
    url: absUrl(origin, "/"),
    inLanguage: site.locale,
    publisher: ref(ids.author(origin, site.defaultAuthor.id)),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: absUrl(origin, "/search?q={search_term_string}"),
      },
      "query-input": "required name=search_term_string",
    },
  });
}

export function personNode(origin: string, author: SiteAuthor): JsonLdNode {
  return compact({
    "@type": "Person",
    "@id": ids.author(origin, author.id),
    name: author.name,
    description: author.description,
    url: author.url,
    image: author.image ? absUrl(origin, author.image) : null,
    sameAs: author.sameAs,
    jobTitle: author.jobTitle,
  });
}

export function breadcrumbNode(origin: string, pagePath: string, crumbs: Crumb[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    "@id": `${absUrl(origin, pagePath)}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absUrl(origin, c.path),
    })),
  };
}

export interface ArticleInput {
  type: NonNullable<PostMeta["schemaType"]>;
  /** page path, "/posts/<slug>" */
  path: string;
  title: string;
  description: string;
  /** resolved social image (path or absolute URL) */
  image: string | null;
  datePublished: string;
  dateModified: string | null;
  authors: SiteAuthor[];
  publisher: SiteAuthor;
  tags: string[];
  wordCount: number;
  readingMinutes: number;
  inLanguage: string;
  /** folder slug when the note is part of a course */
  courseSlug?: string | null;
  level?: PostMeta["level"];
}

export function articleNode(origin: string, a: ArticleInput): JsonLdNode {
  const url = absUrl(origin, a.path);
  return compact({
    "@type": a.type,
    "@id": `${url}#article`,
    headline: a.title,
    description: a.description,
    image: a.image ? absUrl(origin, a.image) : null,
    datePublished: a.datePublished,
    dateModified: a.dateModified ?? a.datePublished,
    author: a.authors.map((p) => ref(ids.author(origin, p.id))),
    publisher: ref(ids.author(origin, a.publisher.id)),
    keywords: a.tags,
    wordCount: a.wordCount,
    timeRequired: minutesDuration(a.readingMinutes),
    inLanguage: a.inLanguage,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    isPartOf: a.courseSlug ? ref(ids.course(origin, a.courseSlug)) : ref(ids.website(origin)),
    // proficiencyLevel is a TechArticle property; other article types do not define it
    proficiencyLevel: a.type === "TechArticle" && a.level ? capitalize(a.level) : null,
  });
}

export interface CourseInput {
  slug: string;
  title: string;
  description: string;
  image: string | null;
  authors: SiteAuthor[];
  provider: SiteAuthor;
  inLanguage: string;
  keywords: string[];
  level?: PostMeta["level"];
  totalMinutes: number;
  /** in reading order */
  parts: { title: string; slug: string }[];
}

export function courseNode(origin: string, c: CourseInput): JsonLdNode {
  return compact({
    "@type": "Course",
    "@id": ids.course(origin, c.slug),
    name: c.title,
    description: c.description,
    url: absUrl(origin, `/series/${c.slug}`),
    image: c.image ? absUrl(origin, c.image) : null,
    provider: ref(ids.author(origin, c.provider.id)),
    author: c.authors.map((p) => ref(ids.author(origin, p.id))),
    inLanguage: c.inLanguage,
    keywords: c.keywords,
    educationalLevel: c.level ? capitalize(c.level) : null,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: 0, priceCurrency: "USD", category: "Free" },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "Online",
      courseWorkload: minutesDuration(c.totalMinutes),
    },
    // in reading order; `position` is a ListItem property, so the order is carried by the array alone
    hasPart: c.parts.map((p) => ({
      "@type": "TechArticle",
      name: p.title,
      url: absUrl(origin, `/posts/${p.slug}`),
    })),
  });
}

export function collectionPageNode(
  origin: string,
  page: {
    path: string;
    name: string;
    description: string;
    inLanguage: string;
    /** `@id`s of nodes on the same page (breadcrumb, item list) */
    breadcrumbId?: string;
    mainEntityId?: string;
  },
): JsonLdNode {
  const url = absUrl(origin, page.path);
  return compact({
    "@type": "CollectionPage",
    "@id": `${url}#page`,
    name: page.name,
    description: page.description,
    url,
    inLanguage: page.inLanguage,
    isPartOf: ref(ids.website(origin)),
    breadcrumb: page.breadcrumbId ? ref(page.breadcrumbId) : null,
    mainEntity: page.mainEntityId ? ref(page.mainEntityId) : null,
  });
}

export function itemListNode(
  origin: string,
  pagePath: string,
  items: { name: string; path: string }[],
): JsonLdNode {
  return {
    "@type": "ItemList",
    "@id": `${absUrl(origin, pagePath)}#list`,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: absUrl(origin, it.path),
    })),
  };
}

/** Wrap nodes in a schema.org `@graph`, de-duplicating by `@id` (first wins). */
export function graph(nodes: JsonLdNode[]): JsonLdNode {
  const seen = new Set<unknown>();
  const unique = nodes.filter((n) => {
    const id = n["@id"];
    if (id == null) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { "@context": "https://schema.org", "@graph": unique };
}

/**
 * JSON for a <script> body: `<` (and the JS line separators) are escaped as unicode so note text can
 * never close the script tag. Still valid JSON that parses back to the same value.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** A head() script entry carrying the page's JSON-LD graph. */
export function jsonLdScript(nodes: JsonLdNode[]) {
  return { type: "application/ld+json", children: serializeJsonLd(graph(nodes)) };
}
