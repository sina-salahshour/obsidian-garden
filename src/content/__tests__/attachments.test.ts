import { describe, expect, it } from "vite-plus/test";
import { attachmentHref, cleanAttachmentRef, resolveAttachment } from "../attachments.ts";

const vault = new Set([
  "react-explain/cover.svg",
  "react-concepts/cover.svg",
  "react-concepts/img/diagram.png",
  "shared/logo.png",
  "banner.png",
  "react-explain/deep/banner.png",
  "a/x/dup.png",
  "b/dup.png",
  "c/dup.png",
  "img/my pic.png",
]);

const resolve = (ref: string, dir: string) => resolveAttachment(ref, dir, vault);

describe("cleanAttachmentRef", () => {
  it("strips wiki brackets, size, subpath, ./ and decodes", () => {
    expect(cleanAttachmentRef("![[x.png|300]]")).toBe("x.png");
    expect(cleanAttachmentRef("[[x.png#page=2]]")).toBe("x.png");
    expect(cleanAttachmentRef("./img/my%20pic.png")).toBe("img/my pic.png");
  });
});

describe("resolveAttachment", () => {
  it("prefers the note's own folder", () => {
    expect(resolve("cover.svg", "react-explain")).toEqual({
      path: "react-explain/cover.svg",
      ambiguous: [],
    });
    expect(resolve("cover.svg", "react-concepts").path).toBe("react-concepts/cover.svg");
  });

  it("falls back to the nearest ancestor folder", () => {
    expect(resolve("banner.png", "react-explain/deep/er").path).toBe(
      "react-explain/deep/banner.png",
    );
    expect(resolve("banner.png", "react-explain").path).toBe("banner.png");
  });

  it("finds a unique name anywhere in the vault", () => {
    expect(resolve("logo.png", "react-explain")).toEqual({
      path: "shared/logo.png",
      ambiguous: [],
    });
  });

  it("breaks ties by shared prefix, then length, then name, and reports the rest", () => {
    expect(resolve("dup.png", "a/z")).toEqual({
      path: "a/x/dup.png",
      ambiguous: ["b/dup.png", "c/dup.png"],
    });
    expect(resolve("dup.png", "zzz")).toEqual({
      path: "b/dup.png",
      ambiguous: ["c/dup.png", "a/x/dup.png"],
    });
    // two folders without a note-local copy: ambiguous
    expect(resolve("cover.svg", "elsewhere").ambiguous).toHaveLength(1);
  });

  it("resolves paths relative to the note, then from the vault root", () => {
    expect(resolve("../react-concepts/img/diagram.png", "react-explain").path).toBe(
      "react-concepts/img/diagram.png",
    );
    expect(resolve("img/diagram.png", "react-concepts").path).toBe(
      "react-concepts/img/diagram.png",
    );
    expect(resolve("shared/logo.png", "react-explain").path).toBe("shared/logo.png");
    expect(resolve("../../../x.png", "a").path).toBeNull();
  });

  it("handles wiki syntax with a size and %20", () => {
    expect(resolve("[[cover.svg|300]]", "react-concepts").path).toBe("react-concepts/cover.svg");
    expect(resolve("my%20pic.png", "").path).toBe("img/my pic.png");
    expect(resolve("missing.png", "react-explain")).toEqual({ path: null, ambiguous: [] });
  });

  it("builds encoded URLs per segment", () => {
    expect(attachmentHref("img/my pic.png")).toBe("/attachments/img/my%20pic.png");
  });
});
