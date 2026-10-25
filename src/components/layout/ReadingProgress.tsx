import { motion, useScroll, useSpring } from "motion/react";
import type { RefObject } from "react";
import { spring } from "~/lib/motion";

/** Hairline at the very top of the viewport tracking progress through `target` (or the page). */
export function ReadingProgress({ target }: { target?: RefObject<HTMLElement | null> }) {
  const { scrollYProgress } = useScroll(
    target ? { target, offset: ["start 80px", "end end"] } : undefined,
  );
  const scaleX = useSpring(scrollYProgress, spring.scroll);
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-gradient-to-r from-accent/60 via-accent to-accent"
      style={{ scaleX }}
    />
  );
}
