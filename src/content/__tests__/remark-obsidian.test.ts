import { describe, expect, it } from "vite-plus/test";
import { renderNote } from "./render.ts";
import { normalizeMermaid } from "../mdx/remark-obsidian.ts";

const others = [
  {
    path: "react/07 beginWork and Reconciliation.md",
    source:
      "---\naliases: [beginWork]\n---\n# beginWork and Reconciliation\n\n## The entry decision\n",
  },
  { path: "react/react.md", source: "---\ntitle: React Course\n---\nIntro" },
  {
    path: "_private/react/Secret Plans.md",
    source: "---\nvisibility: private\n---\n# Secret Plans\n",
  },
  { path: "Root Note.md", source: "# Root Note Title\n" },
];

const render = (md: string, path = "react/01 Intro.md") => renderNote(path, md, others);

describe("wikilinks", () => {
  it("resolves by basename, case-insensitive", async () => {
    const { html, meta } = await render("See [[07 beginwork and reconciliation]].");
    expect(html).toContain(
      '<a href="/posts/react/07-beginwork-and-reconciliation" data-wikilink="">07 beginwork and reconciliation</a>',
    );
    expect(meta.links).toEqual(["react/07-beginwork-and-reconciliation"]);
  });

  it("supports alias text, headings and both", async () => {
    const { html } = await render(
      "[[07 beginWork and Reconciliation|bw]] [[07 beginWork and Reconciliation#The entry decision]] [[07 beginWork and Reconciliation#The entry decision|gate]]",
    );
    expect(html).toContain(
      '<a href="/posts/react/07-beginwork-and-reconciliation" data-wikilink="">bw</a>',
    );
    expect(html).toContain(
      '<a href="/posts/react/07-beginwork-and-reconciliation#the-entry-decision" data-wikilink="">07 beginWork and Reconciliation &gt; The entry decision</a>',
    );
    expect(html).toContain(
      '<a href="/posts/react/07-beginwork-and-reconciliation#the-entry-decision" data-wikilink="">gate</a>',
    );
  });

  it("resolves same-note heading links and frontmatter aliases", async () => {
    const { html, meta } = await render("[[#Some Heading]] and [[beginWork]]");
    expect(html).toContain(
      '<a href="/posts/react/01-intro#some-heading" data-wikilink="">Some Heading</a>',
    );
    expect(html).toContain(
      'href="/posts/react/07-beginwork-and-reconciliation" data-wikilink="">beginWork</a>',
    );
    expect(meta.links).toEqual(["react/07-beginwork-and-reconciliation"]);
  });

  it("handles escaped pipes inside tables", async () => {
    const { html } = await render(
      "| a | b |\n|---|---|\n| [[07 beginWork and Reconciliation\\|bw]] | x |",
    );
    expect(html).toContain(
      '<a href="/posts/react/07-beginwork-and-reconciliation" data-wikilink="">bw</a>',
    );
  });

  it("renders unresolved links as a span", async () => {
    const { html, meta, searchText } = await render("[[Missing Note|nope]]");
    expect(html).toContain(
      '<span class="wikilink-unresolved" title="Not published">nope<span class="sr-only"> (not published)</span></span>',
    );
    expect(meta.links).toEqual([]);
    // the screen-reader suffix stays out of search text and the TOC
    expect(searchText).toBe("nope");
  });

  it("keeps the unresolved suffix out of heading text", async () => {
    const { meta } = await render("## About [[Missing Note|nope]]\n");
    expect(meta.headings[0]?.text).toBe("About nope");
    expect(meta.headings[0]?.id).toBe("about-nope");
  });

  it("links to a top-level folder note go to /series", async () => {
    const { html, meta } = await render("[[react|the course]]");
    expect(html).toContain('<a href="/series/react" data-wikilink="">the course</a>');
    expect(meta.links).toEqual(["react"]);
  });

  it("public -> private links are unresolved and leak nothing", async () => {
    const { html, meta } = await render("[[Secret Plans|plans]]");
    expect(html).toContain('<span class="wikilink-unresolved" title="Not published">plans<span');
    expect(html).not.toContain("secret-plans");
    expect(meta.links).toEqual([]);
  });

  it("private -> private links resolve", async () => {
    const { html, meta } = await renderNote("_private/react/Diary.md", "[[Secret Plans]]", others);
    expect(html).toContain('<a href="/posts/react/secret-plans" data-wikilink="">Secret Plans</a>');
    expect(meta.visibility).toBe("private");
    expect(meta.slug).toBe("react/diary");
    expect(meta.links).toEqual(["react/secret-plans"]);
  });
});

describe("embeds", () => {
  it("embeds images with optional width", async () => {
    const { html } = await render("![[diagram.png]]\n\n![[my pic.png|300]]");
    expect(html).toContain('<img src="/attachments/diagram.png" alt=""/>');
    expect(html).toContain('<img src="/attachments/my%20pic.png" alt="" width="300"/>');
  });

  it("embeds images with alt text, size, or both", async () => {
    const { html } = await render(
      "![[a.png|A fiber tree]]\n\n![[b.png|300x200]]\n\n![[c.png|Lanes, bit by bit|300]]\n\n![[d.png|Wide|640x360]]",
    );
    expect(html).toContain('<img src="/attachments/a.png" alt="A fiber tree"/>');
    expect(html).toContain('<img src="/attachments/b.png" alt="" width="300" height="200"/>');
    expect(html).toContain('<img src="/attachments/c.png" alt="Lanes, bit by bit" width="300"/>');
    expect(html).toContain('<img src="/attachments/d.png" alt="Wide" width="640" height="360"/>');
  });

  it("names audio/video embeds and adds a download fallback", async () => {
    const { html, searchText } = await render("![[my_clip-v2.mp4]]\n\n![[talk.mp3|The talk]]");
    expect(html).toContain(
      '<video src="/attachments/my_clip-v2.mp4" controls="" preload="metadata" aria-label="my clip v2"><a href="/attachments/my_clip-v2.mp4" download="">Download my clip v2</a></video>',
    );
    expect(html).toContain(
      'aria-label="The talk"><a href="/attachments/talk.mp3" download="">Download The talk</a></audio>',
    );
    expect(searchText).not.toContain("Download");
  });

  it("resolves embeds to their vault-relative attachment path", async () => {
    const { html } = await renderNote(
      "react/01 Intro.md",
      "![[diagram.png|300]]\n\n![[clip.mp4]]\n\n![[../shared/doc.pdf]]",
      others,
      ["react/img/diagram.png", "other/diagram.png", "react/clip.mp4", "shared/doc.pdf"],
    );
    expect(html).toContain('<img src="/attachments/react/img/diagram.png" alt="" width="300"/>');
    expect(html).toContain('src="/attachments/react/clip.mp4"');
    expect(html).toContain('href="/attachments/shared/doc.pdf"');
  });

  it("embeds notes as a link with the target title", async () => {
    const { html } = await render("![[Root Note]]");
    expect(html).toContain('<a href="/posts/root-note" data-embed="">Root Note Title</a>');
  });
});

describe("callouts", () => {
  it("builds the aside shape with title and content", async () => {
    const { html } = await render("> [!tip] How to read\n> Body **bold** text.\n>\n> Second para.");
    expect(html.replace(/>\n</g, "><")).toContain(
      '<aside data-callout="tip"><div class="callout-title"><span class="callout-title-text">How to read</span></div><div class="callout-content"><p>Body <strong>bold</strong> text.</p><p>Second para.</p></div></aside>',
    );
  });

  it("defaults the title to the capitalized type and maps aliases", async () => {
    const { html } = await render("> [!tldr]\n> Short.");
    expect(html.replace(/>\n</g, "><")).toContain(
      '<aside data-callout="summary"><div class="callout-title"><span class="callout-title-text">Tldr</span>',
    );
    const caution = await render("> [!CAUTION] Careful\n> x");
    expect(caution.html).toContain('data-callout="warning"');
  });

  it("marks foldable callouts", async () => {
    const closed = await render("> [!note]- Closed\n> hidden");
    expect(closed.html).toContain('<aside data-callout="note" data-callout-fold="closed">');
    const open = await render("> [!info]+ Open\n> shown");
    expect(open.html).toContain('<aside data-callout="info" data-callout-fold="open">');
  });

  it("leaves plain blockquotes alone", async () => {
    const { html } = await render("> just a quote");
    expect(html).toContain("<blockquote>");
  });
});

describe("code and mermaid", () => {
  it("emits mermaid figures that bypass shiki", async () => {
    const { html } = await render("```mermaid\nflowchart LR\n  A --> B\n```");
    expect(html).toContain(
      '<figure data-mermaid="flowchart LR\n  A --&gt; B" class="mermaid"><pre><code>flowchart LR\n  A --&gt; B</code></pre></figure>',
    );
    expect(html).not.toContain("shiki");
  });

  it("escapes ; in sequence diagram text but leaves other diagrams alone", () => {
    expect(
      normalizeMermaid("sequenceDiagram\n  A->>B: restore; returns\n  Note over A: x; y"),
    ).toBe("sequenceDiagram\n  A->>B: restore#59; returns\n  Note over A: x#59; y");
    expect(normalizeMermaid("flowchart LR\n  A[a; b] --> B")).toBe("flowchart LR\n  A[a; b] --> B");
  });

  it("highlights code with data-language and dual themes", async () => {
    const { html } = await render("```ts\nconst a = 1;\n```\n\n```\nplain\n```");
    expect(html).toMatch(
      /<pre class="shiki shiki-themes github-light github-dark-dimmed"[^>]*data-language="ts"/,
    );
    expect(html).toContain("--shiki-dark:");
    expect(html).toMatch(/<pre class="shiki[^"]*"[^>]*data-language="text"/);
  });
});

describe("inline syntax", () => {
  it("highlights ==marks==", async () => {
    const { html } = await render("this is ==important== stuff");
    expect(html).toContain("this is <mark>important</mark> stuff");
  });

  it("removes %%comments%% and block ids", async () => {
    const { html } = await render("visible %%hidden%% text ^block-1\n\nnext line");
    expect(html).toContain("<p>visible  text</p>");
    expect(html).not.toContain("hidden");
    expect(html).not.toContain("block-1");
  });

  it("turns #tags into links and adds them to meta.tags", async () => {
    const { html, meta } = await renderNote(
      "a.md",
      "---\ntags: [Base]\n---\nAbout #React/Hooks and #fiber.",
      [],
    );
    expect(html).toContain(
      '<a href="/posts?tag=react%2Fhooks" class="tag" data-tag="react/hooks">#React/Hooks</a>',
    );
    expect(html).toContain('<a href="/posts?tag=fiber" class="tag" data-tag="fiber">#fiber</a>.');
    expect(meta.tags).toEqual(["base", "fiber", "react/hooks"]);
  });

  it("does not treat code, URLs, hex colors, numbers or headings as tags", async () => {
    const { html, meta } = await renderNote(
      "a.md",
      "## Heading #nottag\n\n`#incode` https://example.com/#anchor color #fff and #a1b2c3, issue #123\n\n```js\n// #comment\n```",
      [],
    );
    expect(meta.tags).toEqual([]);
    expect(html).not.toContain('class="tag"');
  });
});

describe("meta", () => {
  it("drops the first H1 when it is the title, uses the summary callout as description", async () => {
    const { html, meta } = await render(
      "# Intro Title\n\n> [!summary] TL;DR\n> The **short** version of the note.\n\nFirst paragraph.\n\n## Part A\n\n### Sub\n\n#### Deep\n\n##### Too deep",
    );
    expect(html).not.toContain("<h1");
    expect(meta.title).toBe("Intro Title");
    expect(meta.description).toBe("The short version of the note.");
    expect(meta.headings).toEqual([
      { depth: 2, text: "Part A", id: "part-a" },
      { depth: 3, text: "Sub", id: "sub" },
      { depth: 4, text: "Deep", id: "deep" },
    ]);
    expect(meta.order).toBe(1);
    expect(meta.folder).toBe("react");
    expect(meta.source).toBe("react/01 Intro");
    expect(meta.isFolderNote).toBe(false);
    expect(meta.visibility).toBe("public");
  });

  it("falls back to the filename without its numeric prefix, truncates descriptions", async () => {
    const long = "word ".repeat(80);
    const { meta } = await renderNote(
      "notes/12 Some Title.md",
      `---\ncreated: 2024-03-01\nupdated: 2024-04-02\n---\n${long}`,
      [],
    );
    expect(meta.title).toBe("Some Title");
    expect(meta.description.length).toBeLessThanOrEqual(181);
    expect(meta.description.endsWith("…")).toBe(true);
    expect(meta.date).toBe("2024-03-01T00:00:00.000Z");
    expect(meta.updated).toBe("2024-04-02T00:00:00.000Z");
    expect(meta.wordCount).toBe(80);
    expect(meta.readingMinutes).toBe(1);
  });

  it("marks folder notes", async () => {
    const { meta } = await renderNote(
      "react/react.md",
      "---\ntitle: React Course\n---\nIntro",
      others,
    );
    expect(meta.slug).toBe("react");
    expect(meta.isFolderNote).toBe(true);
    expect(meta.folder).toBe("react");
    expect(meta.order).toBeNull();
  });

  it("refuses a private note stored outside content/_private", async () => {
    await expect(renderNote("leak.md", "---\nprivate: true\n---\nsecret", [])).rejects.toThrow(
      /_private/,
    );
  });

  it("exports a function-body `body` for private notes only", async () => {
    const priv = await renderNote("_private/x.md", "Top secret sentence.", []);
    expect(priv.body).toContain("Top secret sentence.");
    const pub = await renderNote("x.md", "Public sentence.", []);
    expect(pub.body).toBeUndefined();
    expect(pub.searchText).toBe("Public sentence.");
  });
});

describe("covers", () => {
  const covers = ["react-explain/cover.svg", "react-concepts/cover.svg"];
  const courses = [
    { path: "react-explain/react-explain.md", source: "---\ncover: cover.svg\n---\nA" },
    { path: "react-concepts/react-concepts.md", source: '---\ncover: "[[cover.svg]]"\n---\nB' },
  ];

  it("gives every course its own cover.svg", async () => {
    for (const [i, course] of courses.entries()) {
      const { meta } = await renderNote(course.path, course.source, courses, covers);
      expect(meta.cover).toBe(`/attachments/${covers[i]}`);
    }
  });

  it("resolves private notes from their logical folder and nulls unsynced covers", async () => {
    const { meta } = await renderNote(
      "_private/react-concepts/Secret.md",
      "---\nvisibility: private\ncover: cover.svg\n---\nS",
      courses,
      covers,
    );
    expect(meta.cover).toBe("/attachments/react-concepts/cover.svg");
    const missing = await renderNote("react/x.md", "---\ncover: nope.svg\n---\nX", [], covers);
    expect(missing.meta.cover).toBeNull();
  });
});
