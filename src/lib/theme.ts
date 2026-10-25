import { useCallback, useSyncExternalStore } from "react";

import { THEME_STORAGE_KEY, type Theme, type ThemePreference } from "./theme-script";

export * from "./theme-script";

export function readPreference(): ThemePreference {
  try {
    const p = localStorage.getItem(THEME_STORAGE_KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(pref: ThemePreference): Theme {
  return pref === "system" ? systemTheme() : pref;
}

/** Apply a theme to <html>, briefly disabling transitions so colours swap in one frame. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  // two frames: let the new colours paint before transitions come back
  requestAnimationFrame(() =>
    requestAnimationFrame(() => root.classList.remove("theme-switching")),
  );
}

export function setPreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* storage unavailable: the choice still applies for this page view */
  }
  applyTheme(resolveTheme(pref));
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readPreference() === "system") applyTheme(systemTheme());
  };
  mq.addEventListener("change", onSystem);
  return () => {
    observer.disconnect();
    mq.removeEventListener("change", onSystem);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** null on the server and during hydration: the real theme is only known in the browser. */
function getServerSnapshot(): Theme | null {
  return null;
}

/** The resolved theme currently on <html>, reactive to toggles and OS changes. */
export function useTheme(): {
  theme: Theme | null;
  toggle: () => void;
  set: (p: ThemePreference) => void;
} {
  const theme = useSyncExternalStore<Theme | null>(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => setPreference(getSnapshot() === "dark" ? "light" : "dark"), []);
  return { theme, toggle, set: setPreference };
}

/** Read a design token (CSS custom property) from <html>, e.g. cssVar("--accent"). */
export function cssVar(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
