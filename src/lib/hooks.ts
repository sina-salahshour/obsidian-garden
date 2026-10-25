import { useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { spring } from "./motion";

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** Lock page scroll while `active` (overlays), compensating for the scrollbar width. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const { body, documentElement } = document;
    const gap = window.innerWidth - documentElement.clientWidth;
    const prev = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = prev.overflow;
      body.style.paddingRight = prev.paddingRight;
    };
  }, [active]);
}

/**
 * Id of the heading currently being read: the last heading whose top has crossed
 * ~25% of the viewport. Robust for short sections (unlike pure IntersectionObserver).
 */
export function useActiveHeading(ids: readonly string[], offsetRatio = 0.25): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join("|");
  useEffect(() => {
    if (!ids.length) return;
    let frame = 0;
    const compute = () => {
      frame = 0;
      const line = window.innerHeight * offsetRatio;
      let current: string | null = ids[0] ?? null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - line <= 0) current = id;
        else break;
      }
      // at the very bottom, the last heading wins even if it never reaches the line
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = ids.at(-1) ?? current;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, offsetRatio]);
  return active;
}

/** Fire once when the element is (nearly) visible. */
export function useInView<T extends Element>(
  rootMargin = "200px",
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView];
}

/** Debounced copy of a value. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Sets --mx/--my on the element under the pointer: drives the CSS spotlight glow without re-renders. */
export function spotlightHandlers() {
  return {
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const r = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
      e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
    },
  };
}

/**
 * Card hover: a gentle, symmetric pull toward the cursor (at most `pull` px each way) on a soft
 * spring, and the spotlight's --mx/--my. No constant lift: it would make the pull lopsided. Mouse only (a touch
 * would leave the card displaced) and still under reduced motion. Spread onto a motion element:
 * `<motion.article {...useCardHover()}>`.
 */
export function useCardHover({ pull = 3 }: { pull?: number } = {}) {
  const reduce = useReducedMotion();
  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const x = useSpring(tx, spring.soft);
  const y = useSpring(ty, spring.soft);
  return {
    style: { x, y },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const r = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
      e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      // descendants that light up under the cursor (cover dot grid) get their own local coords
      for (const el of e.currentTarget.querySelectorAll<HTMLElement>("[data-spot]")) {
        const b = el.getBoundingClientRect();
        el.style.setProperty("--sx", `${e.clientX - b.left}px`);
        el.style.setProperty("--sy", `${e.clientY - b.top}px`);
      }
      if (reduce || e.pointerType !== "mouse") return;
      // -1..1 from the centre, eased so the edges don't feel like a hard stop
      const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      tx.set(Math.sin((nx * Math.PI) / 2) * pull);
      ty.set(Math.sin((ny * Math.PI) / 2) * pull);
    },
    onPointerLeave() {
      tx.set(0);
      ty.set(0);
    },
  };
}

/** Copy text to the clipboard with a textarea fallback for older/insecure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
