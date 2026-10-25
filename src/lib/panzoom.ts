import { animate, useMotionValue, type MotionValue } from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import { spring } from "./motion";

export interface PanZoom {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  zoomBy: (factor: number) => void;
  reset: () => void;
  bind: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onDoubleClick: (e: React.MouseEvent) => void;
  };
}

/**
 * Pan (drag), zoom (wheel / trackpad pinch / two-finger pinch / double-click) for a viewport
 * element. Transform-origin of the content must be "0 0".
 */
export function usePanZoom(
  viewport: React.RefObject<HTMLElement | null>,
  { min = 0.4, max = 6 } = {},
): PanZoom {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; k: number } | null>(null);

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number, smooth = false) => {
      const k0 = scale.get();
      const k = Math.min(max, Math.max(min, k0 * factor));
      const f = k / k0;
      const nx = cx - (cx - x.get()) * f;
      const ny = cy - (cy - y.get()) * f;
      if (smooth) {
        animate(scale, k, spring.panel);
        animate(x, nx, spring.panel);
        animate(y, ny, spring.panel);
      } else {
        scale.set(k);
        x.set(nx);
        y.set(ny);
      }
    },
    [max, min, scale, x, y],
  );

  const center = () => {
    const r = viewport.current?.getBoundingClientRect();
    return r ? { cx: r.width / 2, cy: r.height / 2, r } : { cx: 0, cy: 0, r: null };
  };

  // non-passive wheel listener (React's onWheel is passive)
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 2) {
        // trackpad pinch arrives as ctrl+wheel with small deltas
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
      } else {
        x.set(x.get() - e.deltaX);
        y.set(y.get() - e.deltaY);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [viewport, x, y, zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: scale.get() };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    if (pointers.current.size === 1) {
      x.set(x.get() + next.x - prev.x);
      y.set(y.get() + next.y - prev.y);
    } else if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const r = viewport.current?.getBoundingClientRect();
      if (!r) return;
      const target = Math.min(max, Math.max(min, (pinch.current.k * dist) / pinch.current.dist));
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, target / scale.get());
    }
  };
  const end = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    const r = viewport.current?.getBoundingClientRect();
    if (!r) return;
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.shiftKey ? 1 / 1.8 : 1.8, true);
  };

  return {
    x,
    y,
    scale,
    zoomBy: (factor) => {
      const { cx, cy } = center();
      zoomAt(cx, cy, factor, true);
    },
    reset: () => {
      animate(scale, 1, spring.panel);
      animate(x, 0, spring.panel);
      animate(y, 0, spring.panel);
    },
    bind: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onDoubleClick },
  };
}
