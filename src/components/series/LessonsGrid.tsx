import { Link } from "@tanstack/react-router";
import { motion, type Variants } from "motion/react";
import type { FolderInfo } from "~/content/types";
import { cn } from "~/lib/cn";
import { formatDuration, plural } from "~/lib/format";
import { useCardHover } from "~/lib/hooks";
import { fadeLift, stagger } from "~/lib/motion";
import { Reveal, RevealItem } from "../ui/Reveal";
import { Skeleton } from "../ui/Skeleton";
import { Clock, Layers } from "../ui/icons";
import { SeriesCover } from "./SeriesCover";

export interface Lesson {
  folder: FolderInfo;
  /** total reading minutes of all parts; omitted where it would cost an extra fetch (nav panel) */
  minutes?: number;
}

type Variant = "panel" | "page";

const gridClass = "grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3";

/**
 * One course tile: cover, serif title, parts + reading time, a clamped description. The whole
 * tile is the link (title anchor stretched over it). `compact` is the header panel's denser
 * size. `bodyVariants` animates only the text (the panel staggers it); the cover stays put.
 */
export function LessonTile({
  folder,
  minutes,
  compact = false,
  onSelect,
  bodyVariants,
  className,
}: Lesson & {
  compact?: boolean;
  bodyVariants?: Variants;
  onSelect?: () => void;
  className?: string;
}) {
  const hover = useCardHover();
  return (
    <motion.article
      {...hover}
      className={cn(
        "spotlight glass-edge group relative isolate flex h-full flex-col overflow-hidden shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]",
        compact ? "rounded-xl" : "rounded-2xl",
        className,
      )}
    >
      {/* Slot on the cover's own paper: no lighter tile band can show at a subpixel seam, and the
          corners are concentric with the tile's (radius minus its 1.5px border). */}
      <div
        className={cn(
          "bg-sunken",
          compact
            ? "rounded-t-[calc(var(--radius-xl)-1.5px)]"
            : "rounded-t-[calc(var(--radius-2xl)-1.5px)]",
        )}
      >
        <SeriesCover
          src={folder.cover}
          svg={folder.coverSvg}
          title={folder.title}
          ring={false}
          className={
            compact
              ? "aspect-[21/9] rounded-t-[calc(var(--radius-xl)-1.5px)]"
              : "aspect-[16/9] rounded-t-[calc(var(--radius-2xl)-1.5px)]"
          }
        />
      </div>
      <motion.div
        variants={bodyVariants}
        className={cn("flex flex-1 flex-col", compact ? "p-3.5" : "p-5")}
      >
        <h3
          className={cn(
            "font-serif leading-snug font-medium tracking-tight text-balance",
            compact ? "text-lg" : "text-xl sm:text-[1.375rem]",
          )}
        >
          <Link
            to="/series/$folder"
            params={{ folder: folder.slug }}
            preload="intent"
            onClick={onSelect}
            className={cn(
              "outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-[var(--ring)]",
              compact ? "after:rounded-xl" : "after:rounded-2xl",
            )}
          >
            {folder.title}
          </Link>
        </h3>
        <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-muted">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Parts</dt>
            <Layers size={13} className="text-subtle" />
            <dd>{plural(folder.count, "part")}</dd>
          </div>
          {minutes ? (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Reading time</dt>
              <Clock size={13} className="text-subtle" />
              <dd>{formatDuration(minutes)}</dd>
            </div>
          ) : null}
        </dl>
        {folder.description && (
          <p
            className={cn(
              "mt-2 text-sm leading-relaxed text-pretty text-muted",
              compact ? "line-clamp-1" : "line-clamp-2",
            )}
          >
            {folder.description}
          </p>
        )}
      </motion.div>
    </motion.article>
  );
}

/**
 * Grid of course tiles. `variant="panel"` (header dropdown): compact tiles, the text staggering
 * in, `onSelect` when a tile is chosen. `variant="page"` (/lessons): full tiles with the CSS
 * `.enter` reveal, so it renders identically on the server.
 */
export function LessonsGrid({
  lessons,
  variant = "page",
  onSelect,
  className,
}: {
  lessons: Lesson[];
  variant?: Variant;
  onSelect?: () => void;
  className?: string;
}) {
  if (variant === "panel") {
    return (
      <motion.ul
        variants={stagger(0.04, 0.04)}
        initial="hidden"
        animate="show"
        className={cn(gridClass, className)}
      >
        {lessons.map((l) => (
          <li key={l.folder.slug}>
            <LessonTile {...l} compact bodyVariants={fadeLift} onSelect={onSelect} />
          </li>
        ))}
      </motion.ul>
    );
  }
  return (
    <Reveal as="ul" delay={0.12} className={cn(gridClass, "gap-4 sm:gap-5", className)}>
      {lessons.map((l, i) => (
        <RevealItem as="li" key={l.folder.slug} index={i}>
          <LessonTile {...l} onSelect={onSelect} />
        </RevealItem>
      ))}
    </Reveal>
  );
}

export function LessonTileSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn("overflow-hidden border border-line", compact ? "rounded-xl" : "rounded-2xl")}
      aria-hidden="true"
    >
      <Skeleton className={cn("rounded-none", compact ? "aspect-[21/9]" : "aspect-[16/9]")} />
      <div className={compact ? "p-3.5" : "p-5"}>
        <Skeleton className="h-5 w-3/5" />
        <Skeleton className="mt-2.5 h-3 w-24" />
        <Skeleton className="mt-3 h-3.5 w-full" />
      </div>
    </div>
  );
}

export function LessonsGridSkeleton({
  count = 3,
  compact = false,
  className,
}: {
  count?: number;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(gridClass, className)} role="status" aria-label="Loading lessons">
      {Array.from({ length: count }, (_, i) => (
        <LessonTileSkeleton key={i} compact={compact} />
      ))}
    </div>
  );
}
