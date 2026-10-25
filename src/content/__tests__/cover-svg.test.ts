import { describe, expect, it } from "vite-plus/test";
import { coverSvgMap, prepareCoverSvg } from "../cover-svg.ts";

describe("prepareCoverSvg", () => {
  it("strips active content and external references", () => {
    const out = prepareCoverSvg(
      `<?xml version="1.0"?><!-- hi --><svg viewBox="0 0 8 5" onload="alert(1)"><script>alert(2)</script>` +
        `<foreignObject><div/></foreignObject><a href="javascript:alert(3)"><rect onclick='x()' width="1"/></a>` +
        `<image href="https://evil.test/x.png"/></svg>`,
      "p",
    )!;
    expect(out).not.toMatch(
      /script|alert|onload|onclick|foreignObject|javascript|evil|<!--|<\?xml/,
    );
    expect(out).toContain('<rect width="1"/>');
  });

  it("makes the root fill its box and namespaces ids", () => {
    const out = prepareCoverSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="1600" height="900" role="img">` +
        `<defs><pattern id="dots"/></defs><rect fill="url(#dots)"/><use href="#dots"/></svg>`,
      "cv/a b",
    )!;
    expect(out).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 800 500" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">/,
    );
    expect(out).not.toContain("1600");
    expect(out).toContain('id="cv-a-b-dots"');
    expect(out).toContain("url(#cv-a-b-dots)");
    expect(out).toContain('href="#cv-a-b-dots"');
  });

  it("returns null without an svg root", () => {
    expect(prepareCoverSvg("<html></html>", "p")).toBeNull();
  });
});

describe("coverSvgMap", () => {
  it("keys covers by their encoded /attachments href", () => {
    const map = coverSvgMap({
      "/public/attachments/my course/cover.svg": `<svg viewBox="0 0 1 1"></svg>`,
      "/elsewhere/x.svg": `<svg></svg>`,
    });
    expect([...map.keys()]).toEqual(["/attachments/my%20course/cover.svg"]);
  });
});
