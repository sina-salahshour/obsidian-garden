import { describe, expect, test } from "vite-plus/test";
import {
  formatDate,
  formatDuration,
  formatReading,
  humanize,
  isoDate,
  partNumber,
  plural,
} from "./format";

describe("format", () => {
  test("formatDate is timezone-stable (UTC) and tolerant of bad input", () => {
    expect(formatDate("2026-01-01T00:30:00Z")).toBe("Jan 1, 2026");
    expect(formatDate("2026-12-31T23:30:00-05:00")).toBe("Jan 1, 2027");
    expect(formatDate("not a date")).toBe("");
    expect(formatDate(null)).toBe("");
  });

  test("isoDate keeps the date part", () => {
    expect(isoDate("2026-10-25T13:00:00.000Z")).toBe("2026-10-25");
  });

  test("reading time and durations", () => {
    expect(formatReading(0.2)).toBe("1 min read");
    expect(formatReading(12.4)).toBe("12 min read");
    expect(formatReading(75)).toBe("1 h 15 min read");
    expect(formatReading(120)).toBe("2 h read");
    expect(formatDuration(200)).toBe("3 h 20 min");
  });

  test("small helpers", () => {
    expect(plural(1, "part")).toBe("1 part");
    expect(plural(17, "part")).toBe("17 parts");
    expect(humanize("react-explain")).toBe("React Explain");
    expect(partNumber(7)).toBe("07");
    expect(partNumber(21)).toBe("21");
  });
});
