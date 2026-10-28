import { useEffect, useState } from "react";

/** True when `el` scrolls horizontally (content wider than its box). Tracks resizes. */
export function isOverflowing(el: Element): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

/**
 * Whether the referenced element overflows horizontally. Wide code, tables and equations scroll
 * inside their own box; only then do they need to be focusable (keyboard scrolling) and named.
 */
export function useOverflow(ref: React.RefObject<HTMLElement | null>): boolean {
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setOverflowing(isOverflowing(el));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [ref]);
  return overflowing;
}

/** Props that make a scrolling box reachable and named for keyboard and screen-reader users. */
export function scrollRegion(overflowing: boolean, label: string) {
  return overflowing
    ? ({ tabIndex: 0, role: "region", "aria-label": label } as const)
    : ({} as Record<string, never>);
}
