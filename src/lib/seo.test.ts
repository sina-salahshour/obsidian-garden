import { describe, expect, test } from "vite-plus/test";
import type { SiteAuthor } from "~/content/types";
import { site } from "~/site.config";
import { robotsTxt } from "./robots";
import { ogLocale, pageTitle, seo, socialImage } from "./seo";
import { escapeXml } from "./xml";

const origin = "https://example.com";
const get = (meta: Record<string, string>[], key: string) =>
  meta.filter((m) => m.name === key || m.property === key).map((m) => m.content);

const bob: SiteAuthor = {
  id: "bob",
  name: "Bob",
  aliases: [],
  description: "",
  url: null,
  image: null,
  sameAs: [],
  twitter: "@bob",
  jobTitle: null,
};

describe("seo", () => {
  test("pageTitle follows the site pattern", () => {
    expect(pageTitle()).toBe(site.title);
    expect(pageTitle("Fiber")).toBe(`Fiber · ${site.title}`);
  });

  test("socialImage prefers raster candidates and falls back to the site image, then /og.png", () => {
    expect(socialImage("/attachments/a.png", "/attachments/b.png")).toBe("/attachments/a.png");
    expect(socialImage(null, "/attachments/cover.svg", "/attachments/c.jpg")).toBe(
      "/attachments/c.jpg",
    );
    expect(socialImage(null, "/attachments/cover.SVG")).toBe(site.image ?? "/og.png");
  });

  test("ogLocale uses the language_TERRITORY form", () => {
    expect(ogLocale("en")).toBe("en_US");
    expect(ogLocale("en-GB")).toBe("en_GB");
    expect(ogLocale("fa_IR")).toBe("fa_IR");
  });

  test("indexable article: canonical, absolute image, authors, section, large previews", () => {
    const { meta, links, scripts } = seo({
      siteUrl: origin,
      title: "Fiber",
      path: "/posts/fiber",
      image: "/attachments/x.png",
      type: "article",
      publishedTime: "2026-01-01",
      section: "React Explained",
      authors: [bob],
      tags: ["react"],
    });
    expect(links).toEqual([{ rel: "canonical", href: "https://example.com/posts/fiber" }]);
    expect(get(meta, "og:image")).toEqual(["https://example.com/attachments/x.png"]);
    expect(get(meta, "og:image:alt")).toEqual(["Fiber"]);
    expect(get(meta, "article:author")).toEqual(["Bob"]);
    expect(get(meta, "article:section")).toEqual(["React Explained"]);
    expect(get(meta, "twitter:creator")).toEqual(["@bob"]);
    expect(get(meta, "robots")).toEqual(["index, follow, max-image-preview:large"]);
    expect(get(meta, "og:locale")).toEqual([ogLocale(site.locale)]);
    expect(scripts).toHaveLength(1);
    const ld = JSON.parse(scripts[0]!.children);
    const types = ld["@graph"].map((n: { "@type": string }) => n["@type"]);
    expect(types[0]).toBe("WebSite");
    expect(types).toContain("Person");
  });

  test("canonical override wins for cross-posts; noindex pages say noindex, follow", () => {
    const { meta, links } = seo({
      siteUrl: origin,
      path: "/posts/x",
      canonical: "https://elsewhere.dev/x",
      noindex: true,
    });
    expect(links).toEqual([{ rel: "canonical", href: "https://elsewhere.dev/x" }]);
    expect(get(meta, "og:url")).toEqual(["https://elsewhere.dev/x"]);
    expect(get(meta, "robots")).toEqual(["noindex, follow"]);
  });

  test("no origin: no canonical and no JSON-LD", () => {
    const { links, scripts } = seo({ title: "x", path: "/x" });
    expect(links).toEqual([]);
    expect(scripts).toEqual([]);
  });

  test("page schema nodes are appended to the graph", () => {
    const { scripts } = seo({
      siteUrl: origin,
      schema: (o) => [{ "@type": "CollectionPage", "@id": `${o}/tags#page` }],
    });
    const ld = JSON.parse(scripts[0]!.children);
    expect(ld["@graph"].at(-1)).toEqual({
      "@type": "CollectionPage",
      "@id": "https://example.com/tags#page",
    });
  });
});

describe("robots.txt", () => {
  test("allows everyone, blocks listed crawlers and points at the sitemap", () => {
    expect(robotsTxt(origin, ["GPTBot", "CCBot"])).toBe(
      [
        "User-agent: *",
        "Allow: /",
        "",
        "User-agent: GPTBot",
        "Disallow: /",
        "",
        "User-agent: CCBot",
        "Disallow: /",
        "",
        "Sitemap: https://example.com/sitemap.xml",
        "",
      ].join("\n"),
    );
  });
});

describe("escapeXml", () => {
  test("escapes the five XML specials", () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;",
    );
  });
});
