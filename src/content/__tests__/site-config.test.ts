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
      title: "Data Garden",
      locale: "en",
      url: null,
      keywords: [],
      authors: [],
    });
    expect(
      parseSiteData({ title: "T", keywords: "bad", authors: [{ name: "X" }, { nope: 1 }] }),
    ).toMatchObject({ title: "T", keywords: [], authors: [{ id: "x", name: "X", sameAs: [] }] });
  });

  it("github settings: defaults for old json, accepts only normalised urls", () => {
    expect(parseSiteData({ title: "T" })).toMatchObject({ github: null, githubButton: "icon" });
    expect(
      parseSiteData({ github: "https://github.com/a/b", githubButton: "stars" }),
    ).toMatchObject({ github: "https://github.com/a/b", githubButton: "stars" });
    expect(parseSiteData({ github: "a/b", githubButton: "huge" })).toMatchObject({
      github: null,
      githubButton: "icon",
    });
  });

  it("resolves each homepage field independently of the site metadata", () => {
    const settings = { title: "My garden", description: "My site description" };
    expect(createSite(parseSiteData(settings))).toMatchObject({
      ...settings,
      heroTitle: [settings.title],
      heroDescription: settings.description,
    });
    expect(
      createSite(
        parseSiteData({ ...settings, heroTitle: "  Frontend notes  ", heroDescription: 42 }),
      ),
    ).toMatchObject({
      ...settings,
      heroTitle: ["Frontend notes"],
      heroDescription: settings.description,
    });
    expect(
      createSite(
        parseSiteData({ ...settings, heroTitle: "   ", heroDescription: "Homepage copy" }),
      ),
    ).toMatchObject({
      ...settings,
      heroTitle: [settings.title],
      heroDescription: "Homepage copy",
    });
    expect(
      createSite(
        parseSiteData({
          ...settings,
          heroTitle: [" Web development notes ", "Deep dives", "Deep dives", "", 42],
        }),
      ).heroTitle,
    ).toEqual(["Web development notes", "Deep dives"]);
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
