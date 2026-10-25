// Course cover SVGs are inlined (not <img>) so their `var(--token, #fallback)` colours follow the
// site theme. The files come from the owner's vault, but inlining puts them in the page, so strip
// anything active and make the root scale into whatever box the cover is shown in.
import { attachmentHref } from "./attachments.ts";

/**
 * Makes a raw SVG file safe and layout-ready for inline use:
 *   - drops the XML prolog, doctype, comments, <script>, <foreignObject>, event handler attributes
 *     and javascript: / external (non-#) hrefs;
 *   - prefixes every id (and its `url(#…)` / `href="#…"` references) with `idPrefix`, so two
 *     covers on one page cannot capture each other's markers, patterns or gradients;
 *   - sets the root to width/height 100%, `preserveAspectRatio="xMidYMid meet"`, aria-hidden.
 * Returns null when the text has no <svg> root.
 */
export function prepareCoverSvg(raw: string, idPrefix: string): string | null {
  let svg = raw
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|foreignObject)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|foreignObject)\b[^>]*\/?>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*')/gi, (attr, value: string) =>
      value.slice(1, -1).trim().startsWith("#") ? attr : "",
    )
    .trim();

  const open = /<svg\b[^>]*>/i.exec(svg);
  if (!open) return null;
  svg = svg.slice(open.index);

  const p = idPrefix.replace(/[^\w-]/g, "-");
  svg = svg
    .replace(
      /\sid\s*=\s*(["'])([^"']+)\1/g,
      (_m, q: string, id: string) => ` id=${q}${p}-${id}${q}`,
    )
    .replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, (_m, _q, id: string) => `url(#${p}-${id})`)
    .replace(
      /(\s(?:xlink:)?href\s*=\s*)(["'])#([^"']+)\2/g,
      (_m, attr: string, q: string, id: string) => `${attr}${q}#${p}-${id}${q}`,
    );

  const root = /<svg\b[^>]*>/i.exec(svg)![0];
  const attrs = root
    .slice(4, root.endsWith("/>") ? -2 : -1)
    .replace(
      /\s(?:width|height|preserveAspectRatio|aria-hidden|aria-label|role|focusable|class|style)\s*=\s*("[^"]*"|'[^']*')/gi,
      "",
    )
    .trim();
  const ns = /\sxmlns\s*=/.test(` ${attrs}`) ? "" : ' xmlns="http://www.w3.org/2000/svg"';
  const next = `<svg ${attrs}${ns} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">`;
  return svg.replace(root, () => next);
}

/**
 * Builds the cover-URL -> inline SVG map from an `import.meta.glob` over the published attachments
 * (keys like "/public/attachments/react-explain/cover.svg"). The map key is the same
 * `/attachments/…` href that PostMeta.cover / FolderInfo.cover carry.
 */
export function coverSvgMap(files: Record<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, raw] of Object.entries(files)) {
    const path = key.replace(/^.*?\/public\/attachments\//, "");
    if (path === key || typeof raw !== "string") continue;
    const href = attachmentHref(path);
    const svg = prepareCoverSvg(raw, `cv-${path.replace(/\.svg$/i, "")}`);
    if (svg) out.set(href, svg);
  }
  return out;
}
