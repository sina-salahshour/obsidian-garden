import type { ColorPalette } from "../content/color-palettes.ts";

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

export const THEME_STORAGE_KEY = "theme";
export const PALETTE_STORAGE_KEY = "color-palette";
export const THEME_COLORS: Record<Theme, string> = { light: "#faf9f6", dark: "#141312" };

/** Only validated identifiers, token names and hex values reach the inline stylesheet. */
export function paletteStyles(palettes: ColorPalette[]): string {
  return palettes
    .flatMap(({ id, light, dark }) =>
      (["light", "dark"] as const).map((mode) => {
        const colors = mode === "light" ? light : dark;
        return colors
          ? `:root[data-palette="${id}"][data-theme="${mode}"]{${Object.entries(colors)
              .map(([token, color]) => `--${token}:${color}`)
              .join(";")}}`
          : "";
      }),
    )
    .join("");
}

/** Restore the palette and resolve its allowed mode before the first paint. */
export function createThemeScript(palettes: ColorPalette[]): string {
  const available = palettes.map(({ id, light, dark }) => ({
    id,
    light: light?.bg ?? null,
    dark: dark?.bg ?? null,
  }));
  if (!available.length) available.push({ id: "garden", ...THEME_COLORS });
  return `(function(){var a=${JSON.stringify(available)},p,m;try{p=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)});m=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}var c=a.find(function(x){return x.id===p})||a[0],t=m==="light"||m==="dark"?m:window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light",d=document.documentElement;if(!c[t])t=c.light?"light":"dark";d.dataset.palette=c.id;d.dataset.theme=t;d.dataset.themeLocked=String(!c.light||!c.dark);d.style.colorScheme=t;document.getElementById("site-theme-color")?.setAttribute("content",c[t])})()`;
}
