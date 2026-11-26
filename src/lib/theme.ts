import { useSyncExternalStore } from "react";
import type { ColorPalette } from "../content/color-palettes.ts";
import { site } from "../site.config.ts";
import {
  PALETTE_STORAGE_KEY,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  type Theme,
  type ThemePreference,
} from "./theme-script";

export type { Theme } from "./theme-script";

let preference: ThemePreference | undefined;
let selectedPaletteId: string | undefined;
let previewing = false;

function readPreference(): ThemePreference {
  if (preference) return preference;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // The OS preference still works when storage is unavailable.
  }
  return "system";
}

function displayedPalette() {
  const id = document.documentElement.dataset.palette;
  return site.colorPalettes.find((entry) => entry.id === id) ?? site.colorPalettes[0];
}

function selectedPalette() {
  return site.colorPalettes.find((entry) => entry.id === selectedPaletteId) ?? displayedPalette();
}

function resolveTheme(pref: ThemePreference, palette: ColorPalette | undefined): Theme {
  if (palette && !palette.light) return "dark";
  if (palette && !palette.dark) return "light";
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyAppearance(palette: ColorPalette | undefined) {
  const root = document.documentElement;
  const theme = resolveTheme(readPreference(), palette);
  root.classList.add("theme-switching");
  root.dataset.theme = theme;
  root.dataset.palette = palette?.id ?? "garden";
  root.dataset.themeLocked = String(Boolean(palette && (!palette.light || !palette.dark)));
  root.style.colorScheme = theme;
  document
    .getElementById("site-theme-color")
    ?.setAttribute("content", palette?.[theme]?.bg ?? THEME_COLORS[theme]);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => root.classList.remove("theme-switching")),
  );
}

function changeAppearance(palette: ColorPalette | undefined) {
  if (
    document.startViewTransition &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    document.startViewTransition(() => applyAppearance(palette));
  else applyAppearance(palette);
}

export function setColorPalette(id: string) {
  const palette = site.colorPalettes.find((entry) => entry.id === id);
  if (!palette) return;
  previewing = false;
  selectedPaletteId = id;
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, id);
  } catch {
    // Apply for the current page even when storage is unavailable.
  }
  if (displayedPalette()?.id !== id) changeAppearance(palette);
}

export function previewColorPalette(id: string) {
  const palette = site.colorPalettes.find((entry) => entry.id === id);
  if (!palette) return;
  selectedPaletteId ??= displayedPalette()?.id;
  previewing = true;
  if (displayedPalette()?.id !== id) applyAppearance(palette);
}

export function clearPalettePreview() {
  if (!previewing) return;
  previewing = false;
  const palette = selectedPalette();
  if (displayedPalette()?.id !== palette?.id) applyAppearance(palette);
}

function toggleTheme() {
  const palette = selectedPalette();
  if (palette && (!palette.light || !palette.dark)) return;
  preference = resolveTheme(readPreference(), palette) === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The in-memory preference still applies.
  }
  changeAppearance(palette);
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-palette"],
  });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readPreference() === "system") applyAppearance(displayedPalette());
  };
  mq.addEventListener("change", onSystem);
  return () => {
    observer.disconnect();
    mq.removeEventListener("change", onSystem);
  };
}

function getSnapshot() {
  const { palette, theme } = document.documentElement.dataset;
  return `${palette ?? ""}:${theme ?? ""}`;
}

/** React to either axis, including a palette switch within the same light/dark mode. */
export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const [paletteId, rawTheme] = snapshot?.split(":") ?? [];
  const palette =
    site.colorPalettes.find((entry) => entry.id === paletteId) ?? site.colorPalettes[0];
  const savedPalette =
    site.colorPalettes.find((entry) => entry.id === selectedPaletteId) ?? palette;
  const theme: Theme | null = rawTheme === "dark" || rawTheme === "light" ? rawTheme : null;
  return {
    theme,
    palette,
    savedPalette,
    canToggle: !palette || Boolean(palette.light && palette.dark),
    toggle: toggleTheme,
  };
}

/** Read a design token (CSS custom property) from <html>, e.g. cssVar("--accent"). */
export function cssVar(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
