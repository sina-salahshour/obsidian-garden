import type { Mermaid, MermaidConfig } from "mermaid";
import { mixHex } from "./color";
import { cssVar, type Theme } from "./theme";

let instance: Promise<Mermaid> | null = null;
/** Load mermaid once, on demand (it is large and only needed when a diagram scrolls into view). */
function loadMermaid(): Promise<Mermaid> {
  instance ??= import("mermaid").then((m) => m.default);
  return instance;
}

/** Mermaid colours derived from the live design tokens, so diagrams match the page in both themes. */
export function mermaidConfig(theme: Theme): MermaidConfig {
  const t = (name: string) => cssVar(name);
  const surface = t("--surface");
  const accent = t("--accent");
  const warm = t("--warm");
  const fg = t("--fg");
  const muted = t("--muted");
  const line = t("--line");
  const lineStrong = t("--line-strong");
  const sunken = t("--sunken");
  const dark = theme === "dark";

  const nodeFill = mixHex(accent, surface, dark ? 0.16 : 0.08);
  const nodeBorder = mixHex(accent, surface, dark ? 0.55 : 0.45);
  const altFill = mixHex(warm, surface, dark ? 0.16 : 0.12);
  const altBorder = mixHex(warm, surface, 0.5);
  const edge = mixHex(muted, surface, 0.75);
  const cluster = mixHex(sunken, surface, 0.6);
  const font = '"Inter Variable", ui-sans-serif, system-ui, sans-serif';

  const themeVariables = {
    darkMode: dark,
    fontFamily: font,
    fontSize: "14px",
    background: surface,
    textColor: fg,
    titleColor: fg,
    lineColor: edge,
    primaryColor: nodeFill,
    primaryBorderColor: nodeBorder,
    primaryTextColor: fg,
    secondaryColor: altFill,
    secondaryBorderColor: altBorder,
    secondaryTextColor: fg,
    tertiaryColor: cluster,
    tertiaryBorderColor: lineStrong,
    tertiaryTextColor: fg,
    mainBkg: nodeFill,
    nodeBorder,
    nodeTextColor: fg,
    clusterBkg: cluster,
    clusterBorder: lineStrong,
    edgeLabelBackground: surface,
    defaultLinkColor: edge,
    // notes / sequence diagrams
    noteBkgColor: altFill,
    noteBorderColor: altBorder,
    noteTextColor: fg,
    actorBkg: nodeFill,
    actorBorder: nodeBorder,
    actorTextColor: fg,
    actorLineColor: lineStrong,
    signalColor: edge,
    signalTextColor: fg,
    labelBoxBkgColor: nodeFill,
    labelBoxBorderColor: nodeBorder,
    labelTextColor: fg,
    loopTextColor: muted,
    activationBkgColor: altFill,
    activationBorderColor: altBorder,
    sequenceNumberColor: surface,
    // state / class diagrams
    altBackground: sunken,
    compositeBackground: cluster,
    compositeTitleBackground: cluster,
    // pie / git / misc
    pie1: accent,
    pie2: warm,
    pie3: mixHex(accent, surface, 0.55),
    pie4: mixHex(warm, surface, 0.55),
    pieStrokeColor: surface,
    pieOuterStrokeColor: line,
    git0: accent,
    git1: warm,
  };

  // Scoped into the svg's own <style> by mermaid (#id …), so it wins over the base theme.
  const themeCSS = `
    .node rect, .node polygon, .node circle, .node ellipse, .node path { stroke-width: 1.25px; }
    .node rect.basic, .node .label-container { rx: 10px; ry: 10px; }
    .node polygon { stroke-linejoin: round; }
    .cluster rect { rx: 14px; ry: 14px; stroke-width: 1px; stroke-dasharray: 4 4; }
    .cluster-label, .cluster .nodeLabel { font-weight: 600; font-size: 12px; letter-spacing: .02em; fill: ${muted}; color: ${muted}; }
    .flowchart-link, .edgePath .path, .relation, .transition { stroke-width: 1.4px; stroke-linecap: round; stroke-linejoin: round; }
    .marker, marker path { fill: ${edge}; stroke: ${edge}; }
    .edgeLabel, .edgeLabel p, .labelBkg { background-color: ${surface}; color: ${muted}; font-size: 12.5px; }
    .edgeLabel rect { fill: ${surface}; }
    .edgeLabel text, .edgeLabel tspan { fill: ${muted}; font-size: 12.5px; }
    .label text, .label tspan, .nodeLabel tspan { fill: ${fg}; }
    .nodeLabel, .label { font-weight: 500; line-height: 1.35; }
    .nodeLabel code, .edgeLabel code, .label code { font-family: "JetBrains Mono Variable", ui-monospace, monospace; font-size: .9em; }
    .actor { stroke-width: 1.25px; rx: 8px; ry: 8px; }
    .note { rx: 8px; ry: 8px; }
    .messageText { font-size: 13px; }
  `;

  return {
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    look: "classic",
    themeVariables,
    themeCSS,
    fontFamily: font,
    // Native SVG text: mermaid sizes boxes from getBBox of the real text, so labels can't overflow
    // their nodes (HTML labels in foreignObject are measured separately and drift across browsers).
    htmlLabels: false,
    flowchart: {
      curve: "basis",
      padding: 14,
      nodeSpacing: 44,
      rankSpacing: 54,
      useMaxWidth: true,
      diagramPadding: 12,
    },
    sequence: {
      useMaxWidth: true,
      mirrorActors: false,
      actorMargin: 60,
      boxMargin: 10,
      noteMargin: 12,
    },
    state: { useMaxWidth: true },
    class: { useMaxWidth: true },
  };
}

const MERMAID_FONTS = [
  '400 14px "Inter Variable"',
  '500 14px "Inter Variable"',
  '600 12px "Inter Variable"',
  '400 13px "JetBrains Mono Variable"',
];

// mermaid.render is not re-entrant: run renders one at a time.
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

/** Render `source` to an SVG string for `theme`. Rejects with mermaid's parse error. */
export function renderMermaid(source: string, theme: Theme): Promise<string> {
  const job = queue.then(async () => {
    const mermaid = await loadMermaid();
    // Box sizes are measured at render time: measure with the real fonts, not the fallback.
    await Promise.all(MERMAID_FONTS.map((f) => document.fonts.load(f))).catch(() => undefined);
    mermaid.initialize(mermaidConfig(theme));
    const id = `mmd-${++counter}`;
    try {
      const { svg } = await mermaid.render(id, source);
      return svg;
    } finally {
      // mermaid leaves its scratch node behind on errors
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });
  queue = job.catch(() => undefined);
  return job;
}
