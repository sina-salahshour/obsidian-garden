import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import type { PostMeta } from "~/content/types";
import { cn } from "~/lib/cn";
import { partNumber } from "~/lib/format";
import { spring } from "~/lib/motion";

/**
 * "Part 7 of 17" with a segmented bar; each segment links to its part and the current
 * one is marked by a sliding highlight. Lives under the post title.
 */
export function SeriesProgress({
  parts,
  currentSlug,
  seriesTitle,
  seriesSlug,
  className,
}: {
  parts: PostMeta[];
  currentSlug: string;
  seriesTitle: string;
  seriesSlug: string;
  className?: string;
}) {
  const index = parts.findIndex((p) => p.slug === currentSlug);
  if (index < 0) return null;
  return (
    <div className={cn("rounded-2xl border border-line bg-surface/60 p-4", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <Link
          to="/series/$folder"
          params={{ folder: seriesSlug }}
          className="link-draw min-w-0 truncate font-medium text-fg"
        >
          {seriesTitle}
        </Link>
        <span className="shrink-0 text-muted tabular-nums">
          {parts[index]!.order != null && <>Part {partNumber(parts[index]!.order!)} · </>}
          {index + 1} <span className="text-subtle">of {parts.length}</span>
        </span>
      </div>
      <ol className="mt-3 flex gap-1" aria-label="Series parts">
        {parts.map((p, i) => (
          <li key={p.slug} className="flex-1">
            <Link
              to="/posts/$"
              params={{ _splat: p.slug }}
              preload="intent"
              title={p.title}
              aria-label={`Part ${i + 1}: ${p.title}`}
              aria-current={i === index ? "page" : undefined}
              /* 24px tall hit target around the 6px bar; the negative margin keeps the layout */
              className="group relative -my-[3px] block py-[9px]"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-[background-color,transform] duration-300 group-hover:scale-y-150",
                  i < index
                    ? "bg-accent/45"
                    : i === index
                      ? "bg-transparent"
                      : "bg-line-strong/70 group-hover:bg-accent/40",
                )}
              />
              {i === index && (
                <motion.span
                  layoutId="series-progress-current"
                  transition={spring.layout}
                  className="absolute inset-x-0 top-[9px] h-1.5 rounded-full bg-accent"
                />
              )}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
