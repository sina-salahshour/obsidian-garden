import { describe, expect, test } from "vite-plus/test";
import { findRanges, splitRanges } from "./highlight";

describe("splitRanges", () => {
  test("splits around ranges", () => {
    expect(splitRanges("react fiber tree", [[6, 11]])).toEqual([
      { text: "react ", hit: false },
      { text: "fiber", hit: true },
      { text: " tree", hit: false },
    ]);
  });

  test("merges overlapping and unsorted ranges, clamps out-of-bounds", () => {
    expect(
      splitRanges("abcdefgh", [
        [5, 99],
        [0, 2],
        [1, 3],
        [4, 4],
      ]),
    ).toEqual([
      { text: "abc", hit: true },
      { text: "de", hit: false },
      { text: "fgh", hit: true },
    ]);
  });

  test("no ranges -> one plain segment; empty text -> nothing", () => {
    expect(splitRanges("plain", [])).toEqual([{ text: "plain", hit: false }]);
    expect(splitRanges("", [[0, 3]])).toEqual([]);
  });

  test("segments always reassemble to the original text", () => {
    const text = "useEffect runs after commit";
    const parts = splitRanges(text, [
      [0, 3],
      [2, 9],
      [21, 27],
    ]);
    expect(parts.map((p) => p.text).join("")).toBe(text);
  });
});

describe("findRanges", () => {
  test("finds every case-insensitive occurrence of each term", () => {
    expect(findRanges("Fiber and fiber", "FIBER")).toEqual([
      [0, 5],
      [10, 15],
    ]);
  });
  test("ignores single-character terms and blank queries", () => {
    expect(findRanges("a b c", "a")).toEqual([]);
    expect(findRanges("anything", "   ")).toEqual([]);
  });
});
