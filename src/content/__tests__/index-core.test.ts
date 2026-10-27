import { describe, expect, it } from "vite-plus/test";
import { createIndex, makeExcerpt, tokenize, type IndexedPost } from "../index-core.ts";
import type { PostMeta } from "../types.ts";

function meta(slug: string, extra: Partial<PostMeta> = {}): PostMeta {
  return {
    slug,
    title: slug,
    description: "",
    date: "2024-01-01T00:00:00.000Z",
    updated: null,
    tags: [],
    folder: slug.includes("/") ? slug.split("/")[0]! : null,
    order: null,
    aliases: [],
    visibility: "public",
    isFolderNote: false,
    source: slug,
    cover: null,
    wordCount: 100,
    readingMinutes: 1,
    headings: [],
    links: [],
    authors: [],
    socialImage: null,
    noindex: false,
    canonical: null,
    schemaType: null,
    level: null,
    ...extra,
  };
}

const posts: IndexedPost[] = [
  {
    meta: meta("course", {
      title: "The Course",
      folder: "course",
      isFolderNote: true,
      description: "Course intro",
      cover: "/attachments/c.svg",
      tags: ["course"],
    }),
    text: "Intro",
  },
  {
    meta: meta("course/00-index", {
      title: "Index",
      order: 0,
      tags: ["moc", "react"],
      date: "2024-01-01T00:00:00.000Z",
      links: ["course/01-fiber", "course/secret"],
    }),
    text: "Start here.",
  },
  {
    meta: meta("course/01-fiber", {
      title: "Fiber Basics",
      order: 1,
      tags: ["react", "fiber"],
      date: "2024-02-01T00:00:00.000Z",
      headings: [{ depth: 2, text: "Alternate pointers", id: "alternate-pointers" }],
    }),
    text: "A fiber is a unit of work. The fiber tree is double buffered.",
  },
  {
    meta: meta("course/02-hooks", {
      title: "Hooks",
      order: 2,
      tags: ["react", "hooks"],
      date: "2024-03-01T00:00:00.000Z",
      links: ["course/01-fiber"],
    }),
    text: "Hooks live on the fiber as a linked list.",
  },
  {
    meta: meta("course/secret", {
      title: "Secret Fiber Plans",
      order: 3,
      tags: ["react", "fiber"],
      visibility: "private",
      links: ["course/01-fiber"],
      date: "2024-04-01T00:00:00.000Z",
    }),
    text: "classified fiber sentence",
  },
  {
    meta: meta("loose", { title: "Loose Note", tags: ["misc"], date: "2023-06-01T00:00:00.000Z" }),
    text: "Nothing about it.",
  },
];

const anon = createIndex(posts.filter((p) => p.meta.visibility === "public"));
const admin = createIndex(posts);

describe("lists", () => {
  it("excludes folder notes, sorts and paginates", () => {
    const r = anon.list({ pageSize: 2 });
    expect(r.posts.map((p) => p.slug)).toEqual(["course/02-hooks", "course/01-fiber"]);
    expect(r).toMatchObject({ total: 4, page: 1, pageCount: 2 });
    expect(anon.list({ sort: "oldest" }).posts[0]!.slug).toBe("loose");
    expect(anon.list({ sort: "title" }).posts.map((p) => p.title)).toEqual([
      "Fiber Basics",
      "Hooks",
      "Index",
      "Loose Note",
    ]);
    expect(anon.list({ tag: "#Fiber" }).posts.map((p) => p.slug)).toEqual(["course/01-fiber"]);
    expect(anon.list({ folder: "course" }).total).toBe(3);
  });

  it("counts tags (count desc, then alpha)", () => {
    expect(anon.tags()).toEqual([
      { tag: "react", count: 3 },
      { tag: "fiber", count: 1 },
      { tag: "hooks", count: 1 },
      { tag: "misc", count: 1 },
      { tag: "moc", count: 1 },
    ]);
  });
});

describe("series and folders", () => {
  it("orders parts and uses the folder note for FolderInfo", () => {
    expect(anon.series("course")!.map((p) => p.slug)).toEqual([
      "course/00-index",
      "course/01-fiber",
      "course/02-hooks",
    ]);
    expect(anon.series("nope")).toBeNull();
    expect(anon.folders()).toEqual([
      {
        folder: "course",
        slug: "course",
        title: "The Course",
        description: "Course intro",
        cover: "/attachments/c.svg",
        coverSvg: null,
        indexSlug: "course",
        count: 3,
        latest: "2024-03-01T00:00:00.000Z",
        socialImage: null,
        level: null,
        authors: [],
        noindex: false,
      },
    ]);
  });

  it("takes the folder's SEO fields from its folder note", () => {
    const withSeo = posts.map((p) =>
      p.meta.isFolderNote
        ? {
            ...p,
            meta: {
              ...p.meta,
              socialImage: "/attachments/course/card.png",
              level: "advanced" as const,
              authors: ["Ada"],
              noindex: true,
            },
          }
        : p,
    );
    expect(createIndex(withSeo).folders()[0]).toMatchObject({
      slug: "course",
      socialImage: "/attachments/course/card.png",
      level: "advanced",
      authors: ["Ada"],
      noindex: true,
    });
    // a part's fields never leak into the folder
    const noNote = withSeo.filter((p) => !p.meta.isFolderNote);
    noNote[0] = { ...noNote[0]!, meta: { ...noNote[0]!.meta, level: "beginner" } };
    expect(createIndex(noNote).folders()[0]).toMatchObject({
      level: null,
      socialImage: null,
      authors: [],
      noindex: false,
    });
  });

  it("attaches the inline SVG of the folder note's cover, only for folders the viewer sees", () => {
    const coverSvgs = new Map([
      ["/attachments/c.svg", "<svg>course</svg>"],
      ["/attachments/hidden/h.svg", "<svg>hidden</svg>"],
    ]);
    const hidden: IndexedPost = {
      meta: meta("hidden", {
        title: "Hidden",
        folder: "hidden",
        isFolderNote: true,
        visibility: "private",
        cover: "/attachments/hidden/h.svg",
      }),
      text: "",
    };
    const visible = [...posts, hidden].filter((p) => p.meta.visibility === "public");
    const folders = createIndex(visible, { coverSvgs }).folders();
    expect(folders.map((f) => [f.slug, f.coverSvg])).toEqual([["course", "<svg>course</svg>"]]);
    expect(JSON.stringify(folders)).not.toContain("hidden");
  });

  it("falls back to the order-0 note title without a folder note", () => {
    const idx = createIndex(
      posts.filter((p) => !p.meta.isFolderNote && p.meta.visibility === "public"),
    );
    expect(idx.folders()[0]).toMatchObject({
      title: "Index",
      indexSlug: null,
      cover: null,
      coverSvg: null,
      description: "",
    });
  });

  it("prev/next by order, folder note has none", () => {
    const d = anon.detail("course/01-fiber")!;
    expect(d.prev?.slug).toBe("course/00-index");
    expect(d.next?.slug).toBe("course/02-hooks");
    expect(anon.detail("course/02-hooks")!.next).toBeNull();
    expect(admin.detail("course/02-hooks")!.next?.slug).toBe("course/secret");
    expect(anon.detail("course")).toMatchObject({ prev: null, next: null });
  });
});

describe("private notes", () => {
  it("do not exist for anonymous viewers", () => {
    expect(anon.detail("course/secret")).toBeNull();
    expect(anon.get("course/secret")).toBeUndefined();
    expect(anon.list({ pageSize: 50 }).posts.some((p) => p.visibility === "private")).toBe(false);
    expect(anon.search("classified")).toEqual([]);
    expect(anon.graph().nodes.some((n) => n.id === "course/secret")).toBe(false);
    expect(
      anon.graph().links.some((l) => l.source === "course/secret" || l.target === "course/secret"),
    ).toBe(false);
    expect(anon.detail("course/01-fiber")!.backlinks.map((b) => b.slug)).toEqual([
      "course/02-hooks",
      "course/00-index",
    ]);
    expect(anon.related("course/01-fiber", 10).some((p) => p.slug === "course/secret")).toBe(false);
    expect(
      JSON.stringify([anon.tags(), anon.folders(), anon.graph(), anon.list({ pageSize: 100 })]),
    ).not.toContain("Secret");
  });

  it("are visible to admins", () => {
    expect(admin.detail("course/secret")?.meta.title).toBe("Secret Fiber Plans");
    expect(admin.search("classified").map((h) => h.slug)).toEqual(["course/secret"]);
    expect(admin.graph().links).toContainEqual({
      source: "course/secret",
      target: "course/01-fiber",
    });
    expect(admin.detail("course/01-fiber")!.backlinks.map((b) => b.slug)).toContain(
      "course/secret",
    );
    expect(admin.series("course")!.length).toBe(4);
  });
});

describe("graph and related", () => {
  it("builds nodes with degree and drops dangling links", () => {
    const g = anon.graph();
    expect(g.links).toEqual(
      expect.arrayContaining([
        { source: "course/00-index", target: "course/01-fiber" },
        { source: "course/02-hooks", target: "course/01-fiber" },
      ]),
    );
    expect(g.links).toHaveLength(2);
    expect(g.nodes.find((n) => n.id === "course/01-fiber")!.degree).toBe(2);
  });

  it("ranks related by shared tags and links", () => {
    expect(anon.related("course/02-hooks", 2).map((p) => p.slug)).toEqual([
      "course/01-fiber",
      "course/00-index",
    ]);
    expect(anon.related("missing")).toEqual([]);
  });
});

describe("search", () => {
  it("tokenizes", () => {
    expect(tokenize("  Fiber  TREE fiber ")).toEqual(["fiber", "tree"]);
    expect(tokenize("")).toEqual([]);
  });

  it("boosts title matches over body matches and requires every token", () => {
    const hits = anon.search("fiber");
    expect(hits[0]!.slug).toBe("course/01-fiber");
    expect(hits.map((h) => h.slug)).toContain("course/02-hooks");
    expect(anon.search("fiber linked").map((h) => h.slug)).toEqual(["course/02-hooks"]);
    expect(anon.search("   ")).toEqual([]);
    expect(anon.search("fiber", { tag: "hooks" }).map((h) => h.slug)).toEqual(["course/02-hooks"]);
    expect(anon.search("fiber", { limit: 1 })).toHaveLength(1);
  });

  it("builds an excerpt with highlight ranges", () => {
    const hit = anon.search("double")[0]!;
    expect(hit.excerpt).toBe("A fiber is a unit of work. The fiber tree is double buffered.");
    const [start, end] = hit.ranges[0]!;
    expect(hit.excerpt.slice(start, end)).toBe("double");
  });

  it("windows long text around the first match", () => {
    const text = `${"lorem ipsum ".repeat(40)}needle here ${"dolor sit ".repeat(40)}`;
    const ex = makeExcerpt(text, ["needle"])!;
    expect(ex.excerpt.startsWith("…")).toBe(true);
    expect(ex.excerpt.endsWith("…")).toBe(true);
    expect(ex.excerpt.length).toBeLessThanOrEqual(170);
    const [s, e] = ex.ranges[0]!;
    expect(ex.excerpt.slice(s, e)).toBe("needle");
  });
});
