import { describe, expect, test } from "vite-plus/test";
import type { SiteAuthor } from "~/content/types";
import {
  articleNode,
  breadcrumbNode,
  courseNode,
  graph,
  ids,
  itemListNode,
  jsonLdScript,
  minutesDuration,
  personNode,
  serializeJsonLd,
  websiteNode,
} from "./schema";

const origin = "https://example.com";
const ada: SiteAuthor = {
  id: "ada-lovelace",
  name: "Ada Lovelace",
  aliases: ["Ada"],
  description: "",
  url: "https://ada.dev",
  image: "/attachments/_site/ada.png",
  sameAs: ["https://github.com/ada"],
  twitter: "@ada",
  jobTitle: null,
};

describe("schema", () => {
  test("ids are stable and absolute", () => {
    expect(ids.website(origin)).toBe("https://example.com/#website");
    expect(ids.author(origin, "ada-lovelace")).toBe("https://example.com/#/author/ada-lovelace");
    expect(ids.course(origin, "react-explain")).toBe(
      "https://example.com/series/react-explain#course",
    );
  });

  test("WebSite carries a SearchAction and a publisher ref", () => {
    const node = websiteNode(origin, {
      title: "Garden",
      description: "Notes",
      locale: "en",
      defaultAuthor: ada,
    });
    expect(node).toMatchObject({
      "@type": "WebSite",
      url: "https://example.com/",
      inLanguage: "en",
      publisher: { "@id": ids.author(origin, "ada-lovelace") },
      potentialAction: {
        "@type": "SearchAction",
        target: { urlTemplate: "https://example.com/search?q={search_term_string}" },
      },
    });
  });

  test("Person drops empty fields and makes the avatar absolute", () => {
    const node = personNode(origin, ada);
    expect(node.image).toBe("https://example.com/attachments/_site/ada.png");
    expect(node).not.toHaveProperty("description");
    expect(node).not.toHaveProperty("jobTitle");
    expect(node.sameAs).toEqual(["https://github.com/ada"]);
  });

  test("article in a course points at the course and keeps its position", () => {
    const node = articleNode(origin, {
      type: "TechArticle",
      path: "/posts/react-explain/fiber",
      title: "Fiber",
      description: "d",
      image: "/og.png",
      datePublished: "2026-01-01",
      dateModified: null,
      authors: [ada],
      publisher: ada,
      tags: ["react"],
      wordCount: 1200,
      readingMinutes: 6,
      inLanguage: "en",
      courseSlug: "react-explain",
      position: 3,
      level: "advanced",
    });
    expect(node).toMatchObject({
      "@type": "TechArticle",
      "@id": "https://example.com/posts/react-explain/fiber#article",
      image: "https://example.com/og.png",
      dateModified: "2026-01-01",
      timeRequired: "PT6M",
      isPartOf: { "@id": ids.course(origin, "react-explain") },
      position: 3,
      proficiencyLevel: "Advanced",
      author: [{ "@id": ids.author(origin, "ada-lovelace") }],
    });
  });

  test("a standalone article has no position and belongs to the website", () => {
    const node = articleNode(origin, {
      type: "BlogPosting",
      path: "/posts/x",
      title: "X",
      description: "",
      image: null,
      datePublished: "2026-01-01",
      dateModified: "2026-02-01",
      authors: [ada],
      publisher: ada,
      tags: [],
      wordCount: 10,
      readingMinutes: 0,
      inLanguage: "en",
      position: 4,
      level: null,
    });
    expect(node.isPartOf).toEqual({ "@id": ids.website(origin) });
    expect(node).not.toHaveProperty("position");
    expect(node).not.toHaveProperty("image");
    expect(node).not.toHaveProperty("keywords");
    expect(node.timeRequired).toBe("PT1M");
  });

  test("course lists its parts in order, free and online", () => {
    const node = courseNode(origin, {
      slug: "c",
      title: "Course",
      description: "d",
      image: "https://cdn.example/x.png",
      authors: [ada],
      provider: ada,
      inLanguage: "en",
      keywords: ["a"],
      level: "beginner",
      totalMinutes: 95,
      parts: [
        { title: "One", slug: "c/one" },
        { title: "Two", slug: "c/two" },
      ],
    });
    expect(node).toMatchObject({
      "@id": "https://example.com/series/c#course",
      image: "https://cdn.example/x.png",
      educationalLevel: "Beginner",
      isAccessibleForFree: true,
      offers: { price: 0, priceCurrency: "USD", category: "Free" },
      hasCourseInstance: { courseMode: "Online", courseWorkload: "PT95M" },
      hasPart: [
        {
          "@type": "TechArticle",
          name: "One",
          url: "https://example.com/posts/c/one",
          position: 1,
        },
        {
          "@type": "TechArticle",
          name: "Two",
          url: "https://example.com/posts/c/two",
          position: 2,
        },
      ],
    });
  });

  test("breadcrumbs and item lists are 1-based with absolute URLs", () => {
    const crumbs = breadcrumbNode(origin, "/tags", [
      { name: "Home", path: "/" },
      { name: "Tags", path: "/tags" },
    ]);
    expect(crumbs["@id"]).toBe("https://example.com/tags#breadcrumb");
    expect(crumbs.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://example.com/" },
      { "@type": "ListItem", position: 2, name: "Tags", item: "https://example.com/tags" },
    ]);
    const list = itemListNode(origin, "/lessons", [{ name: "C", path: "/series/c" }]);
    expect(list).toMatchObject({ numberOfItems: 1, itemListElement: [{ position: 1 }] });
  });

  test("graph de-duplicates nodes by @id", () => {
    const g = graph([personNode(origin, ada), personNode(origin, ada), { "@type": "Thing" }]);
    expect(g["@context"]).toBe("https://schema.org");
    expect(g["@graph"]).toHaveLength(2);
  });

  test("serialised JSON-LD cannot close its script tag and still parses", () => {
    const evil = { name: "</script><script>alert(1)</script>\u2028" };
    const out = serializeJsonLd(evil);
    expect(out).not.toContain("<");
    expect(out).not.toContain("\u2028");
    expect(JSON.parse(out)).toEqual(evil);
    expect(jsonLdScript([evil]).type).toBe("application/ld+json");
  });

  test("minutesDuration rounds and never goes below a minute", () => {
    expect(minutesDuration(12.4)).toBe("PT12M");
    expect(minutesDuration(0)).toBe("PT1M");
  });
});
