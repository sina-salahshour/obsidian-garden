import { describe, expect, test } from "vite-plus/test";
import { parseOrigins, pickOrigin } from "./site-origin";

describe("parseOrigins", () => {
  test("splits, normalises and drops invalid entries", () => {
    expect(parseOrigins(" https://a.com/, b.org  http://c.net/x ,, ::bad")).toEqual([
      "https://a.com",
      "https://b.org",
      "http://c.net",
    ]);
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins("")).toEqual([]);
  });
});

describe("pickOrigin", () => {
  const origins = ["https://a.com", "https://b.org"];
  test("uses the origin matching the request host", () => {
    expect(pickOrigin(origins, "b.org")).toBe("https://b.org");
    expect(pickOrigin(origins, "B.ORG, proxy.internal")).toBe("https://b.org");
  });
  test("falls back to the first origin", () => {
    expect(pickOrigin(origins, "evil.com")).toBe("https://a.com");
    expect(pickOrigin(origins, null)).toBe("https://a.com");
    expect(pickOrigin([], "a.com")).toBeNull();
  });
});
