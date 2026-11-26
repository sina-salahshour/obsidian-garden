import { motion } from "motion/react";
import { useEffect, useState, type RefObject } from "react";
import { cn } from "~/lib/cn";
import { spring } from "~/lib/motion";

const readingSpeed = 12; // CSS pixels per second
const bottomGutter = 80; // Leave the last line clear of the mobile controls.
const scrollKeys = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

export function useReadingAutoScroll(body: RefObject<HTMLElement | null>) {
  const [status, setStatus] = useState<"idle" | "playing" | "paused">("idle");
  const playing = status === "playing";
  const pause = () => setStatus((current) => (current === "playing" ? "paused" : current));
  const toggle = () => setStatus((current) => (current === "playing" ? "paused" : "playing"));

  useEffect(() => {
    if (!playing) return;
    const content = body.current;
    const scroller = document.scrollingElement;
    if (!content || !scroller) return;

    const controller = new AbortController();
    const { signal } = controller;
    let frame: number;
    let previous = performance.now();
    let position = window.scrollY;
    let applied = position;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") pause();
      if (!scrollKeys.has(event.key)) return;
      if (event.target instanceof HTMLElement) {
        if (event.target.isContentEditable || event.target.closest("input, textarea, select"))
          return;
        if (event.key === " " && event.target.closest("button, a[href]")) return;
      }
      pause();
    };

    const step = (now: number) => {
      const actual = window.scrollY;
      if (Math.abs(actual - applied) > 1) {
        pause();
        return;
      }
      const viewport = scroller.clientHeight;
      const end = Math.min(
        scroller.scrollHeight - viewport,
        content.getBoundingClientRect().bottom + actual - viewport + bottomGutter,
      );
      if (position >= end) {
        pause();
        return;
      }
      // Keep fractional positions between frames and cap catch-up after a dropped frame.
      position = Math.min(
        end,
        position + (Math.min(Math.max(0, now - previous), 64) * readingSpeed) / 1000,
      );
      previous = now;
      window.scrollTo({ top: position, behavior: "instant" });
      applied = window.scrollY;
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    window.addEventListener("wheel", pause, { passive: true, signal });
    window.addEventListener("touchmove", pause, { passive: true, signal });
    window.addEventListener("keydown", onKeyDown, { signal });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) pause();
      },
      { signal },
    );
    return () => {
      cancelAnimationFrame(frame);
      controller.abort();
    };
  }, [body, playing]);

  return { playing, started: status !== "idle", pause, toggle };
}

export type ReadingAutoScroll = ReturnType<typeof useReadingAutoScroll>;

export function ReadingAutoScrollButton({
  controls,
  showLabel = false,
  className,
}: {
  controls: ReadingAutoScroll;
  showLabel?: boolean;
  className?: string;
}) {
  const { playing, toggle } = controls;
  const label = playing ? "Pause auto-scroll" : "Start auto-scroll";
  return (
    <motion.button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={showLabel ? undefined : label}
      whileTap={{ scale: 0.94 }}
      transition={spring.snappy}
      className={cn(
        "no-print inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-medium text-muted transition-colors hover:bg-sunken hover:text-fg",
        playing && "bg-accent-soft text-accent-strong",
        showLabel ? "px-3" : "w-11",
        className,
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d={playing ? "M5 3.5h2v9H5zM9 3.5h2v9H9z" : "M5 3.5v9L12 8Z"} />
      </svg>
      {showLabel && <span>{playing ? "Pause auto-scroll" : "Auto-scroll"}</span>}
    </motion.button>
  );
}
