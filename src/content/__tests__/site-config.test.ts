import { describe, expect, it } from "vite-plus/test";
import {
  createSite,
  minimalAuthor,
  parseSiteData,
  resolveAuthors,
  resolveAuthorsIn,
  site,
} from "../../site.config.ts";
import type { SiteAuthor } from "../types.ts";

const ada: SiteAuthor = {
  ...minimalAuthor("Ada Lovelace"),
  aliases: ["Countess"],
  description: "First programmer.",
};
const grace = minimalAuthor("Grace Hopper");

describe("site.config", () => {
  it("parses site.json with defaults for everything", () => {
    const data = parseSiteData(undefined);
    expect(data).toMatchObject({
      title: "Obsidian Garden",
      locale: "en",
      url: null,
      keywords: [],
      authors: [],
    });
    expect(
      parseSiteData({ title: "T", keywords: "bad", authors: [{ name: "X" }, { nope: 1 }] }),
    ).toMatchObject({ title: "T", keywords: [], authors: [{ id: "x", name: "X", sameAs: [] }] });
  });

  it("falls back to an author named after the site", () => {
    const s = createSite(parseSiteData({ title: "My Garden" }));
    expect(s.author).toBe("My Garden");
    expect(s.defaultAuthor).toMatchObject({ id: "my-garden", name: "My Garden" });
    expect(createSite(parseSiteData({ authors: [ada, grace] })).author).toBe("Ada Lovelace");
  });

  it("resolves authors by id, name or alias; unknown -> minimal; [] -> default", () => {
    const all = [ada, grace];
    expect(resolveAuthorsIn(all, ada, [])).toEqual([ada]);
    expect(resolveAuthorsIn(all, ada, ["grace hopper", "countess", "ada-lovelace"])).toEqual([
      grace,
      ada,
    ]);
    expect(resolveAuthorsIn(all, ada, ["Ada Lovelace", "ADA LOVELACE"])).toEqual([ada]);
    expect(resolveAuthorsIn(all, ada, ["Alan Turing"])).toEqual([minimalAuthor("Alan Turing")]);
  });

  it("exports the committed site", () => {
    expect(site.title).toBeTruthy();
    expect(resolveAuthors([])).toEqual([site.defaultAuthor]);
  });
});
