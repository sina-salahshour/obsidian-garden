import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vite-plus/test";
import { parseColorPalettes, type ColorPalette } from "../content/color-palettes.ts";
import {
  createThemeScript,
  PALETTE_STORAGE_KEY,
  paletteStyles,
  THEME_STORAGE_KEY,
} from "./theme-script";

const colors = {
  bg: "#ffffff",
  surface: "#ffffff",
  sunken: "#f1f1f1",
  fg: "#111111",
  muted: "#444444",
  subtle: "#555555",
  line: "#dddddd",
  "line-strong": "#aaaaaa",
  accent: "#444477",
  "accent-strong": "#333366",
  "accent-fg": "#ffffff",
  warm: "#aa6633",
  "warm-text": "#773311",
};
const palettes: ColorPalette[] = [
  { id: "reader", name: "Reader", light: colors, dark: { ...colors, bg: "#101010" } },
  { id: "dark-only", name: "Dark only", dark: { ...colors, bg: "#222222" } },
  { id: "light-only", name: "Light only", light: { ...colors, bg: "#eeeeee" } },
];

type FakeRoot = { dataset: Record<string, string>; style: Record<string, string>; chrome?: string };

/** Run the inline script in an isolated context with a tiny fake DOM. */
function run({
  stored,
  storedPalette,
  available = [],
  systemDark,
  storageThrows = false,
}: {
  stored?: string | null;
  storedPalette?: string;
  available?: ColorPalette[];
  systemDark: boolean;
  storageThrows?: boolean;
}): FakeRoot {
  const root: FakeRoot = { dataset: {}, style: {} };
  runInNewContext(createThemeScript(available), {
    document: {
      documentElement: root,
      getElementById: () => ({
        setAttribute: (_attribute: string, color: string) => {
          root.chrome = color;
        },
      }),
    },
    localStorage: {
      getItem: (k: string) => {
        if (storageThrows) throw new Error("denied");
        if (k === THEME_STORAGE_KEY) return stored ?? null;
        return k === PALETTE_STORAGE_KEY ? (storedPalette ?? null) : null;
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
    const themeScript = createThemeScript([]);
    expect(themeScript.startsWith("(function(){")).toBe(true);
    expect(themeScript).not.toMatch(/\bimport\b|\brequire\(/);
  });

  test("restores a saved palette and its mode colors before paint", () => {
    const root = run({
      available: palettes,
      storedPalette: "reader",
      stored: "dark",
      systemDark: false,
    });
    expect(root.dataset).toEqual({ palette: "reader", theme: "dark", themeLocked: "false" });
    expect(root.chrome).toBe("#101010");
    expect(paletteStyles(palettes)).toContain(
      ':root[data-palette="reader"][data-theme="dark"]{--bg:#101010',
    );
  });

  test("locks to the available mode or falls back when the saved palette is missing", () => {
    const dark = run({
      available: palettes,
      storedPalette: "dark-only",
      stored: "light",
      systemDark: false,
    });
    const light = run({
      available: palettes,
      storedPalette: "light-only",
      stored: "dark",
      systemDark: true,
    });
    const missing = run({
      available: palettes,
      storedPalette: "removed",
      stored: "dark",
      systemDark: false,
    });
    expect(dark.dataset).toEqual({ palette: "dark-only", theme: "dark", themeLocked: "true" });
    expect(light.dataset).toEqual({ palette: "light-only", theme: "light", themeLocked: "true" });
    expect(missing.dataset).toEqual({ palette: "reader", theme: "dark", themeLocked: "false" });
  });

  test("rejects malformed colors and identifiers before generating CSS", () => {
    const { palettes: valid, warnings } = parseColorPalettes([
      ...palettes,
      palettes[0],
      { id: 'invalid"]', name: "Invalid ID", light: colors },
      { id: "bad-color", name: "Invalid color", dark: { ...colors, bg: "#111111; color:red" } },
      { id: "no-modes", name: "No modes" },
    ]);
    expect(valid).toEqual(palettes);
    expect(warnings).toHaveLength(4);
  });
});
