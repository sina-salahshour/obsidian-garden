import { describe, expect, test } from "vite-plus/test";
import { mixHex, parseHex, withAlpha } from "./color";

describe("color", () => {
  test("parseHex handles short and long forms", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("6d4fd1")).toEqual([109, 79, 209]);
    expect(parseHex("oklch(0.5 0.1 290)")).toBeNull();
  });
  test("mixHex blends in sRGB and passes through unknown input", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#ff0000", "#0000ff", 1)).toBe("#ff0000");
    expect(mixHex("red", "#fff", 0.5)).toBe("red");
  });
  test("withAlpha", () => {
    expect(withAlpha("#6d4fd1", 0.5)).toBe("rgba(109, 79, 209, 0.5)");
  });
});
