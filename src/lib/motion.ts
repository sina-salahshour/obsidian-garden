import type { CSSProperties } from "react";
import type { Transition, Variants } from "motion/react";

/**
 * Motion vocabulary. Every animated element in the site uses one of these presets so the
 * whole interface moves with one personality: quick, soft landings, never bouncy enough
 * to feel playful, never slow enough to get in the way of reading.
 */
export const spring = {
  /** Small UI affordances: toggles, chips, buttons, indicators. */
  snappy: { type: "spring", stiffness: 520, damping: 38, mass: 0.6 },
  /** Shared-layout moves (layoutId pills, TOC indicator, list reflow). */
  layout: { type: "spring", stiffness: 420, damping: 36, mass: 0.8 },
  /** Panels and overlays entering (palette, sheets, lightbox). */
  panel: { type: "spring", stiffness: 360, damping: 32, mass: 0.9 },
  /** Larger surfaces and hover lifts. */
  soft: { type: "spring", stiffness: 260, damping: 28, mass: 1 },
  /** Scroll-linked smoothing (reading progress). */
  scroll: { stiffness: 220, damping: 34, restDelta: 0.001 },
} satisfies Record<string, Transition | Record<string, number>>;

export const ease = {
  /** expo-out: fast start, long soft landing */
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const satisfies Record<string, [number, number, number, number]>;

export const duration = { fast: 0.16, base: 0.28, slow: 0.5 } as const;

/**
 * Entrance (fade + 10px lift) for page content. Deliberately CSS, not motion variants: the
 * `.enter` keyframe (styles/app.css) renders identically on server and client (no hydration
 * mismatch), never needs JS to become visible, replays whenever an element mounts on a client
 * navigation, and is switched off by the global prefers-reduced-motion rule.
 * `i` staggers siblings (delay = i × --step, default 45ms).
 */
export function enter(i = 0, className?: string): { className: string; style: CSSProperties } {
  return {
    className: className ? `enter ${className}` : "enter",
    style: { "--i": i } as CSSProperties,
  };
}

/** Fade + 10px lift as motion variants (for elements under AnimatePresence). */
export const fadeLift: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } },
  exit: { opacity: 0, y: -6, transition: { duration: duration.fast, ease: ease.inOut } },
};

/** Plain fade for overlays/backdrops. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: duration.base, ease: ease.out } },
  exit: { opacity: 0, transition: { duration: duration.fast } },
};

/** Floating panels (command palette, popovers): a hint of scale from the top. */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: -8 },
  show: { opacity: 1, scale: 1, y: 0, transition: spring.panel },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: -4,
    transition: { duration: duration.fast, ease: ease.inOut },
  },
};

/** Bottom sheets on mobile. */
export const sheet: Variants = {
  hidden: { y: "100%" },
  show: { y: 0, transition: spring.panel },
  exit: { y: "100%", transition: { duration: 0.22, ease: ease.inOut } },
};

/** Parent variant that staggers its children's `fadeLift`. */
export function stagger(each = 0.045, delay = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: each, delayChildren: delay } },
    exit: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
  };
}

/** Card hover: a 2px lift with a soft spring. */
export const hoverLift = { y: -2, transition: spring.soft } as const;
export const tapPress = { scale: 0.98 } as const;
