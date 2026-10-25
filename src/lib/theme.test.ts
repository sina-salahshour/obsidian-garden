import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vite-plus/test";
import { THEME_STORAGE_KEY, themeScript } from "./theme-script";

type FakeRoot = { dataset: Record<string, string>; style: Record<string, string> };

/** Run the inline script in an isolated context with a tiny fake DOM. */
function run({
  stored,
  systemDark,
  storageThrows = false,
}: {
  stored?: string | null;
  systemDark: boolean;
  storageThrows?: boolean;
}): FakeRoot {
  const root: FakeRoot = { dataset: {}, style: {} };
  runInNewContext(themeScript, {
    document: { documentElement: root },
    localStorage: {
      getItem: (k: string) => {
        if (storageThrows) throw new Error("denied");
        return k === THEME_STORAGE_KEY ? (stored ?? null) : null;
      },
    },
    window: { matchMedia: (q: string) => ({ matches: q.includes("dark") && systemDark }) },
  });
  return root;
}

describe("themeScript", () => {
  test("follows the OS when nothing is stored", () => {
    expect(run({ systemDark: true }).dataset.theme).toBe("dark");
    expect(run({ systemDark: false }).dataset.theme).toBe("light");
  });

  test("an explicit choice wins over the OS and sets color-scheme", () => {
    const root = run({ stored: "light", systemDark: true });
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });

  test("ignores garbage and survives storage errors", () => {
    expect(run({ stored: "purple", systemDark: true }).dataset.theme).toBe("dark");
    expect(run({ storageThrows: true, systemDark: false }).dataset.theme).toBe("light");
  });

  test("is a self-contained IIFE string", () => {
    expect(themeScript.startsWith("(function(){")).toBe(true);
    expect(themeScript).not.toMatch(/\bimport\b|\brequire\(/);
  });
});
