import { describe, expect, it } from "vite-plus/test";
import { authorNames } from "../mdx/remark-meta.ts";
import { renderNote } from "./render.ts";

const meta = async (fm: string, attachments: string[] = []) =>
  (await renderNote("react/01 Intro.md", `---\n${fm}\n---\nBody text.\n`, [], attachments)).meta;

describe("SEO frontmatter -> PostMeta", () => {
  it("defaults when absent", async () => {
    expect(await meta("title: X")).toMatchObject({
      authors: [],
      socialImage: null,
      noindex: false,
      canonical: null,
      schemaType: null,
      level: null,
    });
  });

  it("authors: string or list, wikilinks unwrapped, deduped", async () => {
    expect((await meta("author: Ada Lovelace")).authors).toEqual(["Ada Lovelace"]);
    expect(
      (await meta('authors: ["[[Ada Lovelace|Ada]]", "[[Grace#Bio]]", ada lovelace, " "]')).authors,
    ).toEqual(["Ada Lovelace", "Grace"]);
    // unquoted [[x]] parses as a nested YAML list
    expect((await meta("author: [[Ada]]")).authors).toEqual(["Ada"]);
    expect(authorNames({ authors: ["A"], author: "B" })).toEqual(["A", "B"]);
  });

  it("social-image resolves like a cover", async () => {
    expect((await meta("social-image: card.png", ["react/card.png"])).socialImage).toBe(
      "/attachments/react/card.png",
    );
    expect((await meta('social-image: "[[card.png]]"', ["react/card.png"])).socialImage).toBe(
      "/attachments/react/card.png",
    );
    expect((await meta("social-image: https://cdn.example.com/a.png")).socialImage).toBe(
      "https://cdn.example.com/a.png",
    );
    expect((await meta("social-image: missing.png")).socialImage).toBeNull();
    // independent of the cover
    expect(
      await meta("cover: cover.svg\nsocial-image: card.png", ["react/cover.svg", "react/card.png"]),
    ).toMatchObject({
      cover: "/attachments/react/cover.svg",
      socialImage: "/attachments/react/card.png",
    });
  });

  it("noindex", async () => {
    expect((await meta("noindex: true")).noindex).toBe(true);
    expect((await meta('noindex: "yes"')).noindex).toBe(true);
    expect((await meta("noindex: false")).noindex).toBe(false);
  });

  it("canonical accepts absolute http(s) URLs only", async () => {
    expect((await meta("canonical: https://dev.to/me/post")).canonical).toBe(
      "https://dev.to/me/post",
    );
    expect((await meta("canonical: /posts/x")).canonical).toBeNull();
    expect((await meta("canonical: ftp://x.com/a")).canonical).toBeNull();
  });

  it("schema and level are case-insensitive enums", async () => {
    expect((await meta("schema: techarticle")).schemaType).toBe("TechArticle");
    expect((await meta("schema: BlogPosting")).schemaType).toBe("BlogPosting");
    expect((await meta("schema: Recipe")).schemaType).toBeNull();
    expect((await meta("level: Advanced")).level).toBe("advanced");
    expect((await meta("level: expert")).level).toBeNull();
  });
});
