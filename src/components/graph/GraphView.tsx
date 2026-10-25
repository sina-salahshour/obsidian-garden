import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphData } from "~/content/types";
import { cn } from "~/lib/cn";
import { mixHex, withAlpha } from "~/lib/color";
import { formatReading } from "~/lib/format";
import { spring } from "~/lib/motion";
import { cssVar, useTheme } from "~/lib/theme";
import { ArrowRight, Close, Minus, Plus, Reset, SearchIcon } from "../ui/icons";
import { computeGroups, OTHER, START, taperedEdge, type GraphGroup } from "./graph-model";

export interface GraphNodeInfo {
  description?: string;
  readingMinutes?: number;
}

type GNode = SimulationNodeDatum & GraphData["nodes"][number] & { r: number; group: string };
type GLink = SimulationLinkDatum<GNode>;

interface Engine {
  zoomBy: (f: number) => void;
  fit: () => void;
  flyTo: (id: string) => void;
  setFilter: (group: string | null) => void;
  setSelected: (id: string | null) => void;
  repaint: () => void;
}

const MIN_K = 0.2;
const MAX_K = 5;

/**
 * Interactive note graph on a HiDPI canvas.
 * - d3-force layout tuned by density, gentle settle; nodes sized by degree, coloured by group
 * - hover (or tap) lights a note and its neighbours and dims the rest; glow on the focus
 * - curved, tapered edges; labels placed without overlap, fading in with zoom
 * - smooth camera: wheel / pinch / double-click zoom, drag to pan, fly-to from search, fit
 * - drag nodes (they spring back into the layout on release); click opens the note
 * Client-only (canvas + computed tokens): render from a route with ssr:false.
 */
export function GraphView({
  data,
  info,
  onOpen,
  className,
}: {
  data: GraphData;
  /** optional per-note details for the hover card */
  info?: Record<string, GraphNodeInfo>;
  /** called with the node; folder notes (series starts) should open /series/<id> */
  onOpen: (node: { id: string; isFolderNote: boolean }) => void;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cardAnchor = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = onOpen;
  }, [onOpen]);
  const { theme } = useTheme();

  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const { nodes, links, neighbours, groups, byId } = useMemo(() => {
    const { groups, groupOf } = computeGroups(data.nodes);
    const nodes: GNode[] = data.nodes.map((n) => ({
      ...n,
      r: n.isFolderNote
        ? Math.min(16, 7 + Math.sqrt(n.degree) * 1.2)
        : Math.min(12, 3.5 + Math.sqrt(n.degree) * 1.2),
      group: groupOf.get(n.id) ?? OTHER,
    }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: GLink[] = data.links
      .filter((l) => byId.has(l.source) && byId.has(l.target))
      .map((l) => ({ source: l.source, target: l.target }));
    const neighbours = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set<string>()]));
    for (const l of data.links) {
      neighbours.get(l.source)?.add(l.target);
      neighbours.get(l.target)?.add(l.source);
    }
    return { nodes, links, neighbours, groups, byId };
  }, [data]);

  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    const ctx = el?.getContext("2d");
    if (!el || !box || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const density = links.length / Math.max(1, nodes.length);
    const hasStarts = nodes.some((n) => n.group === START);

    // ---------- colours (re-read on theme change) ----------
    let col = { bg: "", fg: "", muted: "", line: "", group: new Map<string, string>() };
    const readColors = () => {
      const g = new Map<string, string>();
      for (const grp of groups) g.set(grp.id, cssVar(grp.token));
      col = {
        bg: cssVar("--surface"),
        fg: cssVar("--fg"),
        muted: cssVar("--muted"),
        line: cssVar("--line-strong"),
        group: g,
      };
    };
    readColors();

    // ---------- simulation ----------
    // seed on a small spiral so the first frames "bloom" outward instead of exploding
    nodes.forEach((n, i) => {
      if (n.x == null) {
        const a = i * 2.39996;
        const rad = 8 * Math.sqrt(i + 1);
        n.x = Math.cos(a) * rad;
        n.y = Math.sin(a) * rad;
      }
    });
    const sim = forceSimulation(nodes)
      .force(
        "link",
        forceLink<GNode, GLink>(links)
          .id((d) => d.id)
          .distance(density > 4 ? 150 : 80)
          .strength(density > 4 ? 0.035 : 0.25),
      )
      .force(
        "charge",
        forceManyBody<GNode>()
          .strength(density > 4 ? -560 : -260)
          .distanceMax(800),
      )
      .force("center", forceCenter(0, 0))
      .force(
        "collide",
        forceCollide<GNode>((d) => d.r + 16),
      )
      .force("x", forceX<GNode>(0).strength(0.05))
      .force("y", forceY<GNode>(0).strength(0.05))
      .alphaDecay(0.025)
      .velocityDecay(0.38)
      .stop();
    sim.tick(reduce ? 300 : 20);

    // ---------- camera ----------
    let w = 0;
    let h = 0;
    let dpr = 1;
    const view = { x: 0, y: 0, k: 0.6 };
    const target = { ...view };
    let fitted = false;

    // ---------- interaction state ----------
    let hover: GNode | null = null;
    let sel: GNode | null = null;
    let groupFilter: string | null = null;
    let focusMix = 0; // eased 0..1 strength of the dimming
    let frame = 0;
    let t0 = performance.now();

    const focusSet = (): Set<string> | null => {
      const f = hover ?? sel;
      if (f) return new Set([f.id, ...(neighbours.get(f.id) ?? [])]);
      if (groupFilter)
        return new Set(nodes.filter((n) => n.group === groupFilter).map((n) => n.id));
      return null;
    };

    const request = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    function bounds(only?: Set<string> | null) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const n of nodes) {
        if (only && !only.has(n.id)) continue;
        x0 = Math.min(x0, n.x! - n.r);
        y0 = Math.min(y0, n.y! - n.r);
        x1 = Math.max(x1, n.x! + n.r);
        y1 = Math.max(y1, n.y! + n.r);
      }
      return { x0, y0, x1, y1 };
    }

    function fitTo(only?: Set<string> | null, maxK = 1.6) {
      if (!w || !nodes.length) return;
      const b = bounds(only);
      const pad = Math.min(w, h) < 500 ? 40 : 90;
      const k = Math.max(
        MIN_K,
        Math.min(
          maxK,
          Math.min((w - pad * 2) / (b.x1 - b.x0 || 1), (h - pad * 2) / (b.y1 - b.y0 || 1)),
        ),
      );
      target.k = k;
      target.x = (-(b.x0 + b.x1) / 2) * k;
      target.y = (-(b.y0 + b.y1) / 2) * k;
      if (reduce) Object.assign(view, target);
      request();
    }

    const resize = () => {
      const r = box.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      if (!fitted) {
        fitted = true;
        fitTo();
      }
      request();
    };

    const toScreen = (n: GNode) => ({
      x: w / 2 + view.x + n.x! * view.k,
      y: h / 2 + view.y + n.y! * view.k,
    });

    function placeCard() {
      const anchor = cardAnchor.current;
      const n = hover ?? sel;
      if (!anchor) return;
      if (!n || w < 640) {
        anchor.style.transform = "";
        return;
      }
      const p = toScreen(n);
      const cw = 288;
      // clear the node's own label (drawn centred under it), flip to the left on the right half
      const label = n.title.length > 36 ? `${n.title.slice(0, 34)}…` : n.title;
      const half = (ctx!.measureText(label).width * view.k) / 2;
      const off = Math.max(n.r * view.k, half) + 14;
      const right = p.x + off;
      const x = Math.max(
        12,
        Math.min(w - cw - 12, p.x > w * 0.55 || right + cw > w - 12 ? p.x - off - cw : right),
      );
      const y = Math.max(64, Math.min(h - 220, p.y - 32));
      anchor.style.transform = `translate(${x}px, ${y}px)`;
    }

    function draw(now: number) {
      frame = 0;
      const dt = Math.min(64, now - t0);
      t0 = now;
      let animating = false;

      // camera easing (frame-rate independent)
      const a = reduce ? 1 : 1 - Math.pow(1 - 0.2, dt / 16.7);
      for (const key of ["x", "y", "k"] as const) {
        const d = target[key] - view[key];
        if (Math.abs(d) > (key === "k" ? 0.0005 : 0.05)) {
          view[key] += d * a;
          animating = true;
        } else view[key] = target[key];
      }

      const focus = focusSet();
      const want = focus ? 1 : 0;
      focusMix += (want - focusMix) * (reduce ? 1 : 1 - Math.pow(1 - 0.18, dt / 16.7));
      if (Math.abs(want - focusMix) < 0.01) focusMix = want;
      else animating = true;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);

      // dotted paper that moves with the camera
      const step = 40 * view.k;
      if (step > 14) {
        ctx!.fillStyle = withAlpha(col.line, 0.55);
        const ox = (((w / 2 + view.x) % step) + step) % step;
        const oy = (((h / 2 + view.y) % step) + step) % step;
        const rr = Math.min(1.4, 0.6 + view.k * 0.3);
        for (let x = ox; x < w; x += step)
          for (let y = oy; y < h; y += step) ctx!.fillRect(x - rr / 2, y - rr / 2, rr, rr);
      }

      ctx!.setTransform(
        dpr * view.k,
        0,
        0,
        dpr * view.k,
        dpr * (w / 2 + view.x),
        dpr * (h / 2 + view.y),
      );
      const dimA = 1 - focusMix * 0.85;
      const lw = 1 / Math.sqrt(view.k);
      const focusNode = hover ?? sel;

      // edges: curved, tapered (thicker at the source)
      const baseEdge = density > 4 ? 0.3 : 0.55;
      for (const l of links) {
        const s = l.source as GNode;
        const t = l.target as GNode;
        const lit = focusNode
          ? s === focusNode || t === focusNode
          : focus
            ? focus.has(s.id) && focus.has(t.id)
            : false;
        const alpha = lit ? 0.85 : baseEdge * (focus ? dimA : 1);
        if (alpha < 0.02) continue;
        const color = lit ? (col.group.get((focusNode ?? s).group) ?? col.fg) : col.line;
        const { pts } = taperedEdge(s.x!, s.y!, t.x!, t.y!, (lit ? 1.6 : 1) * lw, 0.25 * lw);
        ctx!.fillStyle = withAlpha(color, alpha);
        ctx!.beginPath();
        ctx!.moveTo(pts[0]!, pts[1]!);
        ctx!.quadraticCurveTo(pts[2]!, pts[3]!, pts[4]!, pts[5]!);
        ctx!.lineTo(pts[6]!, pts[7]!);
        ctx!.quadraticCurveTo(pts[8]!, pts[9]!, pts[10]!, pts[11]!);
        ctx!.closePath();
        ctx!.fill();
      }

      // nodes
      for (const n of nodes) {
        const inFocus = !focus || focus.has(n.id);
        const color = col.group.get(n.group) ?? col.muted;
        ctx!.globalAlpha = inFocus ? 1 : Math.max(0.12, dimA);
        if (n.group === START) {
          // series start: soft ring with a slow breathing pulse (static when reduced motion)
          const pulse = reduce ? 0.5 : (Math.sin(now / 700) + 1) / 2;
          ctx!.strokeStyle = withAlpha(color, (0.22 + pulse * 0.25) * (inFocus ? 1 : 0.4));
          ctx!.lineWidth = 1.5 / view.k;
          ctx!.beginPath();
          ctx!.arc(n.x!, n.y!, n.r + 5 + pulse * 3, 0, Math.PI * 2);
          ctx!.stroke();
          ctx!.fillStyle = withAlpha(color, 0.1 * (inFocus ? 1 : 0.4));
          ctx!.beginPath();
          ctx!.arc(n.x!, n.y!, n.r + 5 + pulse * 3, 0, Math.PI * 2);
          ctx!.fill();
        }
        if (n === focusNode) {
          ctx!.save();
          ctx!.shadowColor = color;
          ctx!.shadowBlur = 24 * view.k * dpr;
          ctx!.fillStyle = withAlpha(color, 0.25);
          ctx!.beginPath();
          ctx!.arc(n.x!, n.y!, n.r + 7, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.restore();
        }
        ctx!.fillStyle =
          n === focusNode || n.group === START
            ? color
            : mixHex(color, col.bg, inFocus && focus ? 0.95 : 0.78);
        ctx!.beginPath();
        ctx!.arc(n.x!, n.y!, n.r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.strokeStyle = col.bg;
        ctx!.lineWidth = 1.5 / view.k;
        ctx!.stroke();
      }
      ctx!.globalAlpha = 1;

      // labels: focus first, then by degree; skip any that would overlap (screen space)
      const zoomAlpha = Math.max(0, Math.min(1, (view.k - 0.7) / 0.6));
      const fontWorld = 12 / Math.min(view.k, 1.5);
      ctx!.font = `500 ${fontWorld}px "Inter Variable", ui-sans-serif, system-ui, sans-serif`;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "top";
      const placed: [number, number, number, number][] = [];
      const rank = (n: GNode) =>
        n === focusNode ? 3 : n.group === START ? 2 : focus?.has(n.id) ? 1 : 0;
      for (const n of nodes.toSorted((p, q) => rank(q) - rank(p) || q.degree - p.degree)) {
        const inFocus = focus?.has(n.id);
        const al =
          n === focusNode || n.group === START
            ? 1
            : inFocus
              ? 0.95
              : focus
                ? zoomAlpha * dimA * 0.6
                : Math.max(zoomAlpha, n.degree >= 8 ? 0.9 : 0.75);
        if (al <= 0.03) continue;
        const label = n.title.length > 36 ? `${n.title.slice(0, 34)}…` : n.title;
        ctx!.font = `${n.group === START ? 650 : 500} ${fontWorld}px "Inter Variable", ui-sans-serif, system-ui, sans-serif`;
        const tw = ctx!.measureText(label).width * view.k;
        const p = toScreen(n);
        const ty = p.y + n.r * view.k + 5;
        const fh = fontWorld * view.k;
        const b: [number, number, number, number] = [
          p.x - tw / 2 - 4,
          ty - 2,
          p.x + tw / 2 + 4,
          ty + fh + 2,
        ];
        if (b[2] < 0 || b[0] > w || b[1] > h || b[3] < 0) continue;
        if (placed.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
        placed.push(b);
        ctx!.globalAlpha = al;
        ctx!.lineJoin = "round";
        ctx!.lineWidth = 3.5 / view.k;
        ctx!.strokeStyle = col.bg;
        const ly = n.y! + n.r + 5 / view.k;
        ctx!.strokeText(label, n.x!, ly);
        ctx!.fillStyle = n === focusNode || n.group === START ? col.fg : col.muted;
        ctx!.fillText(label, n.x!, ly);
      }
      ctx!.globalAlpha = 1;

      placeCard();
      if (animating || (hasStarts && !reduce && !document.hidden)) request();
    }

    // ---------- pointer interaction ----------
    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const toWorld = (px: number, py: number) => ({
      x: (px - w / 2 - view.x) / view.k,
      y: (py - h / 2 - view.y) / view.k,
    });
    const pick = (px: number, py: number, slop = 6): GNode | null => {
      const p = toWorld(px, py);
      let best: GNode | null = null;
      let bestD = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(n.x! - p.x, n.y! - p.y);
        if (d < n.r + slop / view.k && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    };
    const zoomAt = (px: number, py: number, factor: number, immediate = false) => {
      const k = Math.max(MIN_K, Math.min(MAX_K, target.k * factor));
      const f = k / target.k;
      const cx = px - w / 2;
      const cy = py - h / 2;
      target.x = cx - (cx - target.x) * f;
      target.y = cy - (cy - target.y) * f;
      target.k = k;
      if (immediate || reduce) Object.assign(view, target);
      request();
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let drag: {
      node: GNode | null;
      moved: number;
      touch: boolean;
      pinch?: { d: number; k: number };
    } | null = null;
    let lastTap = { t: 0, x: 0, y: 0 };

    const setHover = (n: GNode | null) => {
      if (n === hover) return;
      hover = n;
      setHovered(n?.id ?? null);
      el.style.cursor = n ? "pointer" : "grab";
      request();
    };

    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ];
        drag = {
          node: null,
          moved: 99,
          touch: true,
          pinch: { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k },
        };
        return;
      }
      const touch = e.pointerType !== "mouse";
      const node = pick(p.x, p.y, touch ? 14 : 6);
      drag = { node, moved: 0, touch };
      if (node && !reduce) {
        node.fx = node.x;
        node.fy = node.y;
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (prev) pointers.set(e.pointerId, p);
      if (!drag) {
        if (e.pointerType === "mouse") setHover(pick(p.x, p.y));
        return;
      }
      if (drag.pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const k = Math.max(MIN_K, Math.min(MAX_K, (drag.pinch.k * d) / drag.pinch.d));
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, k / target.k, true);
        return;
      }
      if (!prev) return;
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.node) {
        if (reduce || drag.moved < 3) return;
        const wp = toWorld(p.x, p.y);
        drag.node.fx = wp.x;
        drag.node.fy = wp.y;
        sim.alphaTarget(0.18).restart();
      } else {
        view.x += dx;
        view.y += dy;
        target.x = view.x;
        target.y = view.y;
        el.style.cursor = "grabbing";
        request();
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (!drag) return;
      const { node, moved, touch } = drag;
      if (pointers.size === 0) drag = null;
      el.style.cursor = hover ? "pointer" : "grab";
      if (node) {
        // release: the layout pulls it back with a soft spring
        node.fx = null;
        node.fy = null;
        sim.alphaTarget(0);
        if (!reduce && moved >= 6) sim.alpha(Math.max(sim.alpha(), 0.12)).restart();
        if (moved < 6) {
          if (touch) {
            // touch: first tap selects (shows the card), tapping the selected note opens it
            if (sel === node) openRef.current(node);
            else {
              sel = node;
              setSelected(node.id);
              request();
            }
          } else openRef.current(node);
        }
        return;
      }
      if (moved < 6) {
        const p = local(e);
        const now = performance.now();
        if (now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
          zoomAt(p.x, p.y, 1.8);
          lastTap = { t: 0, x: 0, y: 0 };
        } else {
          lastTap = { t: now, x: p.x, y: p.y };
          if (sel) {
            sel = null;
            setSelected(null);
            request();
          }
        }
      }
    };
    const onLeave = () => {
      if (!drag) setHover(null);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      if (e.ctrlKey || e.metaKey || e.deltaMode === 1 || Math.abs(e.deltaY) >= 40) {
        zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022)));
      } else {
        // trackpad two-finger scroll pans
        target.x -= e.deltaX;
        target.y -= e.deltaY;
        view.x = target.x;
        view.y = target.y;
        request();
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false });

    let bloomFits = 0;
    sim.on("tick", () => {
      // keep the camera framing the bloom while the layout is still expanding
      if (bloomFits < 48 && !drag && !sel && !groupFilter) {
        bloomFits++;
        if (bloomFits % 8 === 0) fitTo();
      }
      request();
    });
    if (!reduce) sim.alpha(0.9).restart();

    const ro = new ResizeObserver(resize);
    ro.observe(box);
    resize();

    engine.current = {
      zoomBy: (f) => zoomAt(w / 2, h / 2, f),
      fit: () => fitTo(groupFilter ? focusSet() : null),
      flyTo: (id) => {
        const n = byId.get(id);
        if (!n) return;
        sel = n;
        setSelected(id);
        const k = Math.max(target.k, 1.4);
        target.k = k;
        target.x = -n.x! * k;
        target.y = -n.y! * k;
        if (reduce) Object.assign(view, target);
        request();
      },
      setFilter: (g) => {
        groupFilter = g;
        fitTo(g ? focusSet() : null, 1.8);
      },
      setSelected: (id) => {
        sel = id ? (byId.get(id) ?? null) : null;
        request();
      },
      repaint: () => {
        readColors();
        request();
      },
    };

    return () => {
      sim.stop();
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel);
      engine.current = null;
    };
  }, [nodes, links, neighbours, groups, byId]);

  useEffect(() => {
    engine.current?.repaint();
  }, [theme]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        engine.current?.setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const cardId = hovered ?? selected;
  const cardNode = cardId ? byId.get(cardId) : undefined;
  const cardGroup = cardNode ? groups.find((g) => g.id === cardNode.group) : undefined;
  const cardInfo = cardNode ? info?.[cardNode.id] : undefined;
  const pinned = !!cardNode && selected === cardNode.id && !hovered;
  const partCount = cardNode?.isFolderNote
    ? nodes.filter((n) => !n.isFolderNote && n.folder === cardNode.folder).length
    : 0;

  return (
    <div ref={wrap} className={cn("relative touch-none overflow-hidden select-none", className)}>
      <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 cursor-grab" />

      {/* search: flies the camera to a note */}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-end sm:inset-x-4 sm:top-4">
        <GraphSearch
          nodes={data.nodes}
          onPick={(id) => engine.current?.flyTo(id)}
          className="pointer-events-auto w-full sm:w-72"
        />
      </div>

      {/* hover / selection card: follows the node on wide screens, docks above the controls on phones */}
      <div
        ref={cardAnchor}
        className="pointer-events-none absolute right-3 bottom-[4.25rem] left-3 sm:top-0 sm:right-auto sm:bottom-auto sm:left-0 sm:w-72"
      >
        <AnimatePresence mode="wait">
          {cardNode && (
            <motion.div
              key={cardNode.id}
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.12 } }}
              transition={spring.snappy}
              className={cn(
                "rounded-2xl border border-line bg-surface/95 p-4 shadow-[var(--shadow-lg)] backdrop-blur",
                pinned && "pointer-events-auto",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="mt-2 size-2.5 shrink-0 rounded-full"
                  style={{ background: `var(${cardGroup?.token ?? "--subtle"})` }}
                  aria-hidden="true"
                />
                <p className="min-w-0 flex-1 font-serif text-lg leading-snug font-medium text-balance">
                  {cardNode.title}
                </p>
                {pinned && (
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => {
                      setSelected(null);
                      engine.current?.setSelected(null);
                    }}
                    className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken"
                  >
                    <Close size={15} />
                  </button>
                )}
              </div>
              {cardNode.isFolderNote && (
                <p className="mt-1.5 text-xs font-semibold tracking-wide text-warm uppercase">
                  Start here · {partCount} {partCount === 1 ? "part" : "parts"}
                </p>
              )}
              {cardInfo?.description && (
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">
                  {cardInfo.description}
                </p>
              )}
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
                {cardInfo?.readingMinutes != null && (
                  <span>{formatReading(cardInfo.readingMinutes)}</span>
                )}
                <span>
                  {cardNode.degree} {cardNode.degree === 1 ? "link" : "links"}
                </span>
                {cardNode.tags.slice(0, 3).map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </p>
              {pinned && (
                <button
                  type="button"
                  onClick={() => onOpen(cardNode)}
                  className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-3.5 text-sm font-medium text-bg"
                >
                  Open note <ArrowRight size={14} />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* legend / filter chips + camera controls */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 sm:inset-x-4 sm:bottom-4">
        <Legend
          groups={groups}
          value={filter}
          onChange={(g) => {
            setFilter(g);
            engine.current?.setFilter(g);
          }}
        />
        <div className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-surface/90 p-1 shadow-[var(--shadow-md)] backdrop-blur">
          <GraphButton label="Zoom out" onClick={() => engine.current?.zoomBy(1 / 1.4)}>
            <Minus size={16} />
          </GraphButton>
          <GraphButton label="Fit to view" onClick={() => engine.current?.fit()}>
            <Reset size={15} />
          </GraphButton>
          <GraphButton label="Zoom in" onClick={() => engine.current?.zoomBy(1.4)}>
            <Plus size={16} />
          </GraphButton>
        </div>
      </div>
    </div>
  );
}

function Legend({
  groups,
  value,
  onChange,
}: {
  groups: GraphGroup[];
  value: string | null;
  onChange: (g: string | null) => void;
}) {
  if (groups.length < 2) return <span />;
  return (
    <div className="no-scrollbar pointer-events-auto -mb-1 min-w-0 overflow-x-auto pb-1">
      <ul
        className="isolate flex w-max gap-0.5 rounded-full border border-line bg-surface/90 p-1 shadow-[var(--shadow-md)] backdrop-blur"
        aria-label="Filter graph by group"
      >
        {groups.map((g) => {
          const active = value === g.id;
          return (
            <li key={g.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? null : g.id)}
                className={cn(
                  "relative inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                  active ? "text-fg" : "text-muted hover:text-fg",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="graph-legend-pill"
                    transition={spring.layout}
                    className="absolute inset-0 z-0 rounded-full bg-sunken"
                  />
                )}
                <span
                  className="relative z-10 size-2 rounded-full"
                  style={{ background: `var(${g.token})` }}
                  aria-hidden="true"
                />
                <span className="relative z-10">{g.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GraphSearch({
  nodes,
  onPick,
  className,
}: {
  nodes: GraphData["nodes"];
  onPick: (id: string) => void;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const query = q.trim().toLowerCase();
  const results = query
    ? nodes
        .filter(
          (n) => n.title.toLowerCase().includes(query) || n.tags.some((t) => t.includes(query)),
        )
        .toSorted(
          (a, b) =>
            Number(!a.title.toLowerCase().startsWith(query)) -
              Number(!b.title.toLowerCase().startsWith(query)) || b.degree - a.degree,
        )
        .slice(0, 6)
    : [];
  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
    setQ("");
  };
  return (
    <div className={cn("relative", className)}>
      <label className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface/90 px-3.5 shadow-[var(--shadow-md)] backdrop-blur transition-colors focus-within:border-accent-line">
        <SearchIcon size={15} className="shrink-0 text-subtle" />
        <span className="sr-only">Find a note in the graph</span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              pick(results[active]!.id);
            } else if (e.key === "Escape") {
              setOpen(false);
              e.currentTarget.blur();
            }
          }}
          placeholder="Find a note…"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="graph-search-list"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
        />
      </label>
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.ul
            id="graph-search-list"
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            transition={spring.snappy}
            className="absolute inset-x-0 top-12 isolate overflow-hidden rounded-2xl border border-line bg-surface/95 p-1 shadow-[var(--shadow-lg)] backdrop-blur"
          >
            {results.map((n, i) => (
              <li
                key={n.id}
                role="option"
                aria-selected={i === active}
                onPointerDown={(e) => {
                  e.preventDefault();
                  pick(n.id);
                }}
                onPointerMove={() => setActive(i)}
                className="relative cursor-pointer rounded-xl px-3 py-2 text-sm"
              >
                {i === active && (
                  <motion.span
                    layoutId="graph-search-active"
                    transition={spring.layout}
                    className="absolute inset-0 z-0 rounded-xl bg-sunken"
                  />
                )}
                <span className="relative z-10 line-clamp-1">{n.title}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function GraphButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.9 }}
      transition={spring.snappy}
      className="inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-fg"
    >
      {children}
    </motion.button>
  );
}
