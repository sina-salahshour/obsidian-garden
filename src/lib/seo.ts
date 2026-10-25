import { site } from "~/site.config";

type Meta = Record<string, string>;

export interface SeoInput {
  title?: string;
  description?: string;
  /** absolute site origin (from the root loader); canonical/og:url are omitted without it */
  siteUrl?: string;
  /** path beginning with "/" */
  path?: string;
  /** "/attachments/x.png" or absolute URL */
  image?: string | null;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string | null;
  tags?: string[];
  noindex?: boolean;
}

const abs = (siteUrl: string | undefined, path: string) =>
  /^https?:\/\//.test(path) || !siteUrl ? path : `${siteUrl.replace(/\/$/, "")}${path}`;

/** Title in the site's pattern: "Page · Site" (or just the site title). */
export function pageTitle(title?: string) {
  return title ? `${title} · ${site.title}` : site.title;
}

/** meta + links for a route's head(). */
export function seo(input: SeoInput): { meta: Meta[]; links: Meta[] } {
  const title = pageTitle(input.title);
  const description = input.description || site.description;
  const image = abs(input.siteUrl, input.image || "/og.png");
  const meta: Meta[] = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: input.title ?? site.title },
    { property: "og:description", content: description },
    { property: "og:type", content: input.type ?? "website" },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: input.title ?? site.title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
  const links: Meta[] = [];
  if (input.siteUrl && input.path) {
    const url = abs(input.siteUrl, input.path);
    meta.push({ property: "og:url", content: url });
    links.push({ rel: "canonical", href: url });
  }
  if (input.type === "article") {
    if (input.publishedTime)
      meta.push({ property: "article:published_time", content: input.publishedTime });
    if (input.modifiedTime)
      meta.push({ property: "article:modified_time", content: input.modifiedTime });
    meta.push({ property: "article:author", content: site.author });
    for (const t of input.tags ?? []) meta.push({ property: "article:tag", content: t });
  }
  if (input.noindex) meta.push({ name: "robots", content: "noindex" });
  return { meta, links };
}
