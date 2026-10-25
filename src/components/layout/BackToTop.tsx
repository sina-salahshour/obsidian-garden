import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { spring } from "~/lib/motion";
import { ArrowUp } from "../ui/icons";
import { cn } from "~/lib/cn";

export function BackToTop({ className }: { className?: string }) {
  const { scrollY } = useScroll();
  const [show, setShow] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setShow(y > 900));
  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    document.getElementById("main")?.focus({ preventScroll: true });
  };
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          onClick={toTop}
          aria-label="Back to top"
          initial={{ opacity: 0, scale: 0.6, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 12 }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.92 }}
          transition={spring.snappy}
          className={cn(
            "no-print fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface/90 text-muted shadow-[var(--shadow-md)] backdrop-blur hover:text-fg sm:right-6 sm:bottom-6",
            className,
          )}
        >
          <ArrowUp size={18} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
