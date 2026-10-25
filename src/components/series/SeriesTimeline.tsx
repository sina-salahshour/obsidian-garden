import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import type { PostMeta } from "~/content/types";
import { cn } from "~/lib/cn";
import { formatReading, partNumber } from "~/lib/format";
import { spring } from "~/lib/motion";
import { PrivateBadge } from "../ui/Badge";
import { ArrowRight } from "../ui/icons";

/**
 * Ordered parts as a vertical timeline. The rail draws itself in; each stop is a numbered
 * node that fills with the accent on hover. `currentSlug` marks where the reader is.
 */
export function SeriesTimeline({
  parts,
  currentSlug,
  className,
}: {
  parts: PostMeta[];
  currentSlug?: string;
  className?: string;
}) {
  const currentIndex = currentSlug ? parts.findIndex((p) => p.slug === currentSlug) : -1;
  return (
    <ol className={cn("relative [--step:35ms]", className)} aria-label="Parts in this series">
      <span
        aria-hidden="true"
        className="grow absolute top-5 [--grow-from:1_0] bottom-5 left-[1.1875rem] w-px origin-top bg-gradient-to-b from-accent-line via-line to-transparent"
      />
      {parts.map((p, i) => {
        const current = i === currentIndex;
        const read = currentIndex >= 0 && i < currentIndex;
        return (
          <li key={p.slug} className="enter relative" style={{ "--i": i } as React.CSSProperties}>
            <Link
              to="/posts/$"
              params={{ _splat: p.slug }}
              preload="intent"
              aria-current={current ? "page" : undefined}
              className="group flex items-start gap-4 rounded-2xl py-3 pr-3 transition-colors hover:bg-sunken/70 sm:gap-5"
            >
              <span
                className={cn(
                  "relative z-10 grid size-10 shrink-0 place-items-center rounded-full border font-mono text-xs tabular-nums transition-[background-color,border-color,color,transform] duration-300 group-hover:scale-105",
                  current
                    ? "border-accent bg-accent text-accent-fg shadow-[0_0_0_4px_var(--accent-soft)]"
                    : read
                      ? "border-accent-line bg-accent-soft text-accent-strong"
                      : "border-line-strong bg-bg text-muted group-hover:border-accent group-hover:bg-accent group-hover:text-accent-fg",
                )}
              >
                {partNumber(p.order ?? i + 1)}
              </span>
              <span className="min-w-0 flex-1 pt-1.5">
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className={cn(
                      "font-medium leading-snug text-pretty",
                      current && "text-accent-strong",
                    )}
                  >
                    {p.title}
                  </span>
                  {p.visibility === "private" && <PrivateBadge compact />}
                </span>
                {p.description && (
                  <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted">
                    {p.description}
                  </span>
                )}
                <span className="mt-1.5 block text-xs text-subtle">
                  {formatReading(p.readingMinutes)}
                </span>
              </span>
              <motion.span
                aria-hidden="true"
                className="mt-3 text-subtle opacity-0 transition-opacity group-hover:opacity-100 max-sm:hidden"
                whileHover={{ x: 2 }}
                transition={spring.snappy}
              >
                <ArrowRight size={16} />
              </motion.span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
