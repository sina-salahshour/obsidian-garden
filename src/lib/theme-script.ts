// Pure (React-free) theme constants and the inline no-flash script.
export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

export const THEME_STORAGE_KEY = "theme";

/** Browser-chrome colours per theme; keep in sync with --bg in styles/app.css. */
export const THEME_COLORS: Record<Theme, string> = { light: "#faf9f6", dark: "#141312" };

/**
 * Inline <head> script: resolves the stored preference (or the OS setting) and writes
 * `data-theme` + `color-scheme` on <html> before first paint, so there is never a flash.
 * Kept dependency-free and tiny; localStorage access can throw (privacy modes), hence try/catch.
 */
export const themeScript = `(function(){try{var d=document.documentElement,p=null;try{p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}var t=p==="light"||p==="dark"?p:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");d.dataset.theme=t;d.style.colorScheme=t}catch(e){}})()`;
