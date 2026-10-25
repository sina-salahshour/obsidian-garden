import { describe, expect, it } from "vite-plus/test";
import {
  classifyNotes,
  contentPathFor,
  extractAttachmentRefs,
  frontmatterAttachment,
  injectCreated,
  isSkippedDir,
  prepareNote,
  shouldPublish,
  splitFrontmatter,
  stripComments,
  type VaultNote,
} from "../../../scripts/sync-lib.ts";

const note = (path: string, fm: Record<string, unknown> = {}, body = ""): VaultNote => ({
  path,
  data: fm,
  body,
});
const none = { private: new Set<string>(), nopublish: new Set<string>() };

describe("frontmatter", () => {
  it("splits and parses", () => {
    const s = splitFrontmatter("---\ntitle: X\npublish: false\n---\n# Body\n");
    expect(s.data).toEqual({ title: "X", publish: false });
    expect(s.body).toBe("# Body\n");
    expect(splitFrontmatter("# none").yaml).toBeNull();
  });

  it("publish/draft rules", () => {
    expect(shouldPublish({})).toBe(true);
    expect(shouldPublish({ publish: false })).toBe(false);
    expect(shouldPublish({ draft: true })).toBe(false);
    expect(shouldPublish({ draft: "yes" })).toBe(false);
  });

  it("injects created into the copy only when missing", () => {
    expect(injectCreated("---\ntags: [a]\n---\nBody", "2024-01-01T00:00:00.000Z")).toBe(
      "---\ntags: [a]\ncreated: 2024-01-01T00:00:00.000Z\n---\nBody",
    );
    expect(injectCreated("Body", "2024-01-01T00:00:00.000Z")).toBe(
      "---\ncreated: 2024-01-01T00:00:00.000Z\n---\n\nBody",
    );
    expect(prepareNote("---\ndate: 2023-05-05\n---\nx", "2024-01-01T00:00:00.000Z")).toBe(
      "---\ndate: 2023-05-05\n---\nx",
    );
  });
});

describe("comments", () => {
  it("strips inline and multi-line %% comments outside code", () => {
    expect(stripComments("a %%secret%% b")).toBe("a  b");
    expect(stripComments("keep\n%%\nhidden\n\nalso hidden\n%%\nafter")).toBe("keep\nafter");
    expect(stripComments("`%%code%%` x")).toBe("`%%code%%` x");
    expect(stripComments("```\n%% in fence %%\n```")).toBe("```\n%% in fence %%\n```");
  });
});

describe("attachments", () => {
  it("finds embeds and markdown images, ignores code and URLs", () => {
    const refs = extractAttachmentRefs(
      "![[img.png]] ![[sub/pic one.jpg|300]] [[doc.pdf]] ![alt](<my%20file.svg>) ![x](https://x.com/a.png) `![[code.png]]` [[Note]]",
    );
    expect(refs.sort()).toEqual(["doc.pdf", "img.png", "my file.svg", "pic one.jpg"]);
  });

  it("reads cover/image/banner", () => {
    expect(frontmatterAttachment({ cover: "cover.svg" })).toBe("cover.svg");
    expect(frontmatterAttachment({ image: "[[art/hero.png]]" })).toBe("hero.png");
    expect(frontmatterAttachment({ banner: "https://x.com/a.png" })).toBeNull();
  });

  it("skips dot dirs and templates", () => {
    expect(isSkippedDir(".obsidian")).toBe(true);
    expect(isSkippedDir("a/.trash/b")).toBe(true);
    expect(isSkippedDir("Templates")).toBe(true);
    expect(isSkippedDir("react-explain")).toBe(false);
  });
});

describe("visibility classification", () => {
  it("marks notes private via visibility, private: true or #private", () => {
    const { states } = classifyNotes(
      [
        note("a.md", { visibility: "private" }),
        note("b.md", { private: true }),
        note("c.md", { tags: ["Private"] }),
        note("d.md", {}, "x #private y"),
        note("e.md"),
      ],
      none,
    );
    expect(Object.fromEntries(states)).toEqual({
      "a.md": "private",
      "b.md": "private",
      "c.md": "private",
      "d.md": "private",
      "e.md": "public",
    });
    expect(contentPathFor("a.md", "private")).toBe("_private/a.md");
    expect(contentPathFor("e.md", "public")).toBe("e.md");
    expect(contentPathFor("x.md", "excluded")).toBeNull();
  });

  it("cascades a private folder note to the whole tree (all conventions)", () => {
    for (const fnPath of ["course/course.md", "course.md", "course/index.md"]) {
      const { states } = classifyNotes(
        [
          note(fnPath, { visibility: "private" }),
          note("course/01 a.md"),
          note("course/sub/02 b.md"),
          note("other.md"),
        ],
        none,
      );
      expect(states.get(fnPath)).toBe("private");
      expect(states.get("course/01 a.md")).toBe("private");
      expect(states.get("course/sub/02 b.md")).toBe("private");
      expect(states.get("other.md")).toBe("public");
    }
  });

  it("cascades .private and .nopublish markers, nesting included", () => {
    const { states } = classifyNotes(
      [note("a/x.md"), note("a/b/y.md"), note("c/z.md"), note("c/d/w.md"), note("e.md")],
      { private: new Set(["a"]), nopublish: new Set(["c/d"]) },
    );
    expect(Object.fromEntries(states)).toEqual({
      "a/x.md": "private",
      "a/b/y.md": "private",
      "c/z.md": "public",
      "c/d/w.md": "excluded",
      "e.md": "public",
    });
  });

  it("excludes a whole tree when the folder note is publish: false / draft: true", () => {
    const { states } = classifyNotes(
      [
        note("t/t.md", { draft: true }),
        note("t/a.md"),
        note("t/u/b.md", { visibility: "private" }),
      ],
      none,
    );
    expect([...states.values()]).toEqual(["excluded", "excluded", "excluded"]);
  });

  it("private is sticky: descendants cannot opt back to public (warned)", () => {
    const { states, warnings } = classifyNotes(
      [
        note("p/a.md", { visibility: "public" }),
        note("p/q/q.md", { private: false }),
        note("p/q/b.md"),
      ],
      { private: new Set(["p"]), nopublish: new Set() },
    );
    expect([...states.values()]).toEqual(["private", "private", "private"]);
    expect(warnings).toHaveLength(2);
  });

  it("a private note in a public folder stays local to that note", () => {
    const { states } = classifyNotes([note("f/a.md", { private: true }), note("f/b.md")], none);
    expect(states.get("f/a.md")).toBe("private");
    expect(states.get("f/b.md")).toBe("public");
  });
});
