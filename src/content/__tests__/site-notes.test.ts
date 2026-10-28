import { describe, expect, it } from "vite-plus/test";
import {
  buildSiteData,
  classifyNotes,
  firstParagraph,
  frontmatterAttachments,
  normalizeGithub,
  normalizeHandle,
  partitionSiteNotes,
  planAttachments,
  serializeSiteData,
  splitFrontmatter,
  type VaultNote,
} from "../../../scripts/sync-lib.ts";

const note = (path: string, fm: Record<string, unknown> = {}, body = ""): VaultNote => ({
  path,
  data: fm,
  body,
});
const files = (...paths: string[]) => new Set(paths);

describe("site notes", () => {
  it("are any note with a site: key, split off before classification", () => {
    const notes = [
      note("_site/Site.md", { site: "settings" }),
      note("blog/Settings.md", { site: "settings" }),
      note("blog/Post.md", { title: "Post" }),
      note("Odd.md", { site: null }),
    ];
    const { site, notes: rest } = partitionSiteNotes(notes);
    expect(site.map((n) => n.path)).toEqual(["_site/Site.md", "blog/Settings.md", "Odd.md"]);
    expect(rest.map((n) => n.path)).toEqual(["blog/Post.md"]);
    // classification never sees them, so a public folder can't publish one
    const { states } = classifyNotes(rest, { private: new Set(), nopublish: new Set(["_site"]) });
    expect([...states.keys()]).toEqual(["blog/Post.md"]);
  });

  it("parses frontmatter from a raw note even inside .nopublish (detection is frontmatter only)", () => {
    const { data } = splitFrontmatter("---\nsite: author\nname: Ada\n---\nBio.\n");
    expect(partitionSiteNotes([note("_site/Ada.md", data)]).site).toHaveLength(1);
  });

  it("defaults with no site notes", () => {
    const { data, warnings } = buildSiteData([], files());
    expect(data).toEqual({
      title: "Obsidian Garden",
      description: "Notes, deep dives and explainers, published straight from my Obsidian vault.",
      locale: "en",
      url: null,
      image: null,
      keywords: [],
      twitter: null,
      blockCrawlers: [],
      github: null,
      githubButton: "icon",
      authors: [],
    });
    expect(warnings).toEqual([]);
  });

  it("settings: frontmatter, normalisation, H1 / first paragraph fallbacks", () => {
    const { data, attachments, warnings } = buildSiteData(
      [
        note(
          "_site/Site.md",
          {
            site: "Settings",
            url: "https://example.com/",
            locale: "en-GB",
            image: "card.png",
            keywords: ["react", "internals", "react"],
            twitter: "https://x.com/garden",
            "block-crawlers": "GPTBot, CCBot",
          },
          "%% hidden %%\n# My **Garden**\n\n> quote\n\nA [[Note|garden]] of `code` notes\nover two lines.\n\nSecond.",
        ),
      ],
      files("_site/card.png", "other/card.png"),
    );
    expect(data).toMatchObject({
      title: "My Garden",
      description: "A garden of code notes over two lines.",
      url: "https://example.com",
      locale: "en-GB",
      image: "/attachments/_site/card.png",
      keywords: ["react", "internals"],
      twitter: "@garden",
      blockCrawlers: ["GPTBot", "CCBot"],
    });
    expect(attachments).toEqual(["_site/card.png"]);
    expect(warnings).toEqual([]);
  });

  it("merges settings notes in path order, later overrides earlier (warned on conflict)", () => {
    const { data, warnings } = buildSiteData(
      [
        note("b/Second.md", { site: "settings", title: "Second", twitter: "@same" }),
        note("a/First.md", { site: "settings", title: "First", locale: "fr", twitter: "same" }),
      ],
      files(),
    );
    expect(data).toMatchObject({ title: "Second", locale: "fr", twitter: "@same" });
    expect(warnings).toEqual(["site title: b/Second.md overrides the value set in a/First.md"]);
  });

  it("frontmatter beats a body fallback from another settings note", () => {
    const { data } = buildSiteData(
      [
        note("a.md", { site: "settings" }, "# Heading A\n\nPara A."),
        note("b.md", { site: "settings", description: "From B" }),
      ],
      files(),
    );
    expect(data).toMatchObject({ title: "Heading A", description: "From B" });
  });

  it("warns on svg site images, bad urls, bad locales, unknown roles; ignores drafts", () => {
    const { data, warnings } = buildSiteData(
      [
        note("s.md", { site: "settings", image: "logo.svg", url: "example.com", locale: "en_US!" }),
        note("x.md", { site: "theme" }),
        note("d.md", { site: "settings", title: "Draft", draft: true }),
      ],
      files("logo.svg"),
    );
    expect(data).toMatchObject({
      image: "/attachments/logo.svg",
      url: null,
      locale: "en",
      title: "Obsidian Garden",
    });
    expect(warnings).toHaveLength(4);
    expect(warnings.join("\n")).toMatch(/SVG/);
    expect(warnings.join("\n")).toMatch(/"example.com" is not an absolute/);
    expect(warnings.join("\n")).toMatch(/BCP-47/);
    expect(warnings.join("\n")).toMatch(/unknown site role "theme"/);
  });

  it("authors: name fallbacks, bio, default first, links normalised", () => {
    const { data, attachments, warnings } = buildSiteData(
      [
        note("people/Ada Lovelace.md", { site: "author" }, "First programmer.\n"),
        note(
          "people/grace.md",
          {
            site: "author",
            name: "Grace Hopper",
            default: true,
            aliases: ["Amazing Grace"],
            url: "https://grace.example",
            image: "avatar.png",
            "same-as": ["https://github.com/grace", "not a url"],
            twitter: "@@grace",
            "job-title": "Rear Admiral",
            description: "Compiler pioneer.",
          },
          "Ignored body.",
        ),
        note("people/c.md", { site: "author", title: "Ada Lovelace" }),
      ],
      files("people/avatar.png"),
    );
    expect(data.authors).toEqual([
      {
        id: "grace-hopper",
        name: "Grace Hopper",
        aliases: ["Amazing Grace"],
        description: "Compiler pioneer.",
        url: "https://grace.example/",
        image: "/attachments/people/avatar.png",
        sameAs: ["https://github.com/grace"],
        twitter: "@grace",
        jobTitle: "Rear Admiral",
      },
      {
        id: "ada-lovelace",
        name: "Ada Lovelace",
        aliases: [],
        description: "First programmer.",
        url: null,
        image: null,
        sameAs: [],
        twitter: null,
        jobTitle: null,
      },
    ]);
    expect(attachments).toEqual(["people/avatar.png"]);
    expect(warnings).toHaveLength(2); // bad same-as, duplicate Ada
  });

  it("first author by path is the default without default: true", () => {
    const { data } = buildSiteData(
      [note("z.md", { site: "author", name: "Zed" }), note("a.md", { site: "author", name: "Al" })],
      files(),
    );
    expect(data.authors.map((a) => a.id)).toEqual(["al", "zed"]);
  });

  it("serialises with stable key order", () => {
    const text = serializeSiteData(buildSiteData([], files()).data);
    expect(Object.keys(JSON.parse(text))).toEqual([
      "title",
      "description",
      "locale",
      "url",
      "image",
      "keywords",
      "twitter",
      "blockCrawlers",
      "github",
      "githubButton",
      "authors",
    ]);
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("github and github-button: normalise, default, warn on invalid", () => {
    const ok = buildSiteData(
      [
        note("_site/S.md", {
          site: "settings",
          github: "http://www.github.com/a/b.git/",
          "github-button": "Stars",
        }),
      ],
      files(),
    );
    expect(ok.data).toMatchObject({ github: "https://github.com/a/b", githubButton: "stars" });
    expect(ok.warnings).toEqual([]);
    const bad = buildSiteData(
      [
        note("_site/S.md", {
          site: "settings",
          github: "https://gitlab.com/a/b",
          "github-button": "big",
        }),
      ],
      files(),
    );
    expect(bad.data).toMatchObject({ github: null, githubButton: "icon" });
    expect(bad.warnings).toHaveLength(2);
    expect(normalizeGithub("owner/repo")).toBe("https://github.com/owner/repo");
    expect(normalizeGithub("https://github.com/o/r/tree/main")).toBeNull();
    expect(normalizeGithub("justone")).toBeNull();
  });

  it("helpers", () => {
    expect(normalizeHandle("https://twitter.com/me?x=1")).toBe("@me");
    expect(normalizeHandle("")).toBeNull();
    expect(firstParagraph("# T\n\n```\ncode\n```\n\n- list\n\n![[x.png]]\n\nReal one.")).toBe(
      "Real one.",
    );
  });
});

describe("attachment plan", () => {
  it("includes social-image and site note images", () => {
    expect(frontmatterAttachments({ cover: "c.svg", "social-image": "[[card.png]]" })).toEqual([
      "c.svg",
      "card.png",
    ]);
    expect(frontmatterAttachments({ "social-image": "https://x.com/a.png" })).toEqual([]);
    const notes = [note("blog/Post.md", { "social-image": "card.png" })];
    const plan = planAttachments(
      notes,
      new Map([["blog/Post.md", "public"]]),
      files("blog/card.png", "_site/og.png"),
      ["_site/og.png"],
    );
    expect(plan.publish).toEqual(["_site/og.png", "blog/card.png"]);
  });

  it("a private note's social-image stays private-only", () => {
    const plan = planAttachments(
      [note("p/Secret.md", { "social-image": "s.png" })],
      new Map([["p/Secret.md", "private"]]),
      files("p/s.png"),
    );
    expect(plan).toMatchObject({ publish: [], privateOnly: ["p/s.png"] });
  });
});
