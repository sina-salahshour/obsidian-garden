import { describe, expect, it } from "vite-plus/test";
import {
  collectDirs,
  folderNoteDirFor,
  orderFromName,
  stripOrderPrefix,
  toLogicalPath,
} from "../paths.ts";
import { slugEntries, slugifyPath, slugifySegment } from "../slug.ts";

describe("slugify", () => {
  it("follows github-slugger per segment and collapses dashes", () => {
    expect(slugifyPath("react-explain/07 beginWork and Reconciliation")).toBe(
      "react-explain/07-beginwork-and-reconciliation",
    );
    expect(slugifySegment("09 Commit Phase - Mutation, Layout, Passive Effects")).toBe(
      "09-commit-phase-mutation-layout-passive-effects",
    );
    expect(slugifySegment("03 root.render - Scheduling")).toBe("03-rootrender-scheduling");
    expect(slugifySegment("Ünïcode Straße")).toBe("ünïcode-straße");
  });

  it("parses numeric prefixes", () => {
    expect(orderFromName("07 beginWork")).toBe(7);
    expect(orderFromName("2024 Review")).toBe(2024);
    expect(orderFromName("beginWork 07")).toBeNull();
    expect(stripOrderPrefix("07 beginWork and Reconciliation")).toBe(
      "beginWork and Reconciliation",
    );
    expect(stripOrderPrefix("42")).toBe("42");
  });

  it("strips the _private prefix", () => {
    expect(toLogicalPath("_private/a/b.md")).toBe("a/b.md");
    expect(toLogicalPath("a/b.md")).toBe("a/b.md");
  });
});

describe("folder notes", () => {
  const detect = (notes: string[]) => {
    const set = new Set(notes);
    const dirs = collectDirs(notes);
    return Object.fromEntries(notes.map((n) => [n, folderNoteDirFor(n, set, dirs)]));
  };

  it("detects <dir>/<dir>.md", () => {
    expect(detect(["course/course.md", "course/01 a.md"])).toEqual({
      "course/course.md": "course",
      "course/01 a.md": null,
    });
  });

  it("detects <dir>.md next to <dir>/", () => {
    expect(detect(["course.md", "course/01 a.md"])).toEqual({
      "course.md": "course",
      "course/01 a.md": null,
    });
  });

  it("detects <dir>/index.md", () => {
    expect(detect(["course/index.md", "course/01 a.md"])["course/index.md"]).toBe("course");
  });

  it("first convention wins", () => {
    const r = detect(["course/course.md", "course.md", "course/index.md", "course/01 a.md"]);
    expect(r["course/course.md"]).toBe("course");
    expect(r["course.md"]).toBeNull();
    expect(r["course/index.md"]).toBeNull();
  });

  it("works for nested folders and gives folder notes the folder slug", () => {
    const entries = slugEntries([
      "/content/a/b/b.md",
      "/content/a/b/x.md",
      "/content/_private/c/index.md",
      "/content/_private/c/y.md",
    ]);
    expect(entries.map((e) => [e.slug, e.folderDir])).toEqual([
      ["a/b", "a/b"],
      ["a/b/x", null],
      ["c", "c"],
      ["c/y", null],
    ]);
  });
});
