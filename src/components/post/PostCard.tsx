import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import type { PostMeta } from "~/content/types";
import { cn } from "~/lib/cn";
import { formatDate, formatReading, humanize, isoDate, partNumber } from "~/lib/format";
import { useCardHover } from "~/lib/hooks";
import { PrivateBadge } from "../ui/Badge";
import { ArrowRight } from "../ui/icons";
import { TagChip } from "../ui/TagChip";

export interface PostCardProps {
  post: PostMeta;
  /** Show "Part 07" instead of nothing when the post belongs to an ordered series. */
  showSeries?: boolean;
  /** Series display name (FolderInfo.title) to show next to the part number. */
  seriesTitle?: string;
  maxTags?: number;
  className?: string;
  headingLevel?: "h2" | "h3";
}

/**
 * The main list card. The whole card is clickable (stretched title link) while tag chips
 * stay independently clickable above it. Hover: 2px lift, cursor-following glow, arrow nudge.
 */
export function PostCard({
  post,
  showSeries = true,
  seriesTitle,
  maxTags = 3,
  className,
  headingLevel: H = "h2",
}: PostCardProps) {
  const inSeries = showSeries && post.folder && post.order != null;
  const hover = useCardHover();
  return (
    <motion.article
      {...hover}
      className={cn(
        "spotlight group relative rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-300 hover:border-line-strong hover:shadow-[var(--shadow-md)] sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        {inSeries && (
          <>
            <span className="font-medium text-accent-strong">
              {seriesTitle ?? humanize(post.folder!)} · Part {partNumber(post.order!)}
            </span>
            <span aria-hidden="true" className="text-subtle">
              ·
            </span>
          </>
        )}
        <time dateTime={isoDate(post.date)}>{formatDate(post.date)}</time>
        <span aria-hidden="true" className="text-subtle">
          ·
        </span>
        <span>{formatReading(post.readingMinutes)}</span>
        {post.visibility === "private" && <PrivateBadge className="ml-1" />}
      </div>
      <H className="mt-3 font-serif text-[1.375rem] leading-snug font-medium tracking-tight text-balance sm:text-2xl">
        <Link
          to="/posts/$"
          params={{ _splat: post.slug }}
          preload="intent"
          className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--ring)]"
        >
          {post.title}
        </Link>
      </H>
      {post.description && (
        <p className="mt-2 line-clamp-3 text-[0.9375rem] leading-relaxed text-pretty text-muted">
          {post.description}
        </p>
      )}
      <div className="mt-4 flex items-end justify-between gap-4">
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {post.tags.slice(0, maxTags).map((t) => (
            <li key={t}>
              <TagChip tag={t} />
            </li>
          ))}
          {post.tags.length > maxTags && (
            <li className="self-center text-xs text-subtle">+{post.tags.length - maxTags}</li>
          )}
        </ul>
        <span
          aria-hidden="true"
          className="mb-0.5 shrink-0 text-subtle opacity-0 transition-[opacity,transform,color] duration-300 group-hover:translate-x-1 group-hover:text-accent group-hover:opacity-100 max-sm:hidden"
        >
          <ArrowRight size={18} />
        </span>
      </div>
    </motion.article>
  );
}

/** Small row card for backlinks, related posts and search fallbacks. */
export function PostRow({
  post,
  className,
  eyebrow,
}: {
  post: PostMeta;
  className?: string;
  eyebrow?: React.ReactNode;
}) {
  const hover = useCardHover({ pull: 2, lift: 0 });
  return (
    <motion.div
      {...hover}
      className={cn(
        "spotlight group relative flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted">
          {eyebrow ?? (
            <>
              <time dateTime={isoDate(post.date)}>{formatDate(post.date)}</time>
              <span className="text-subtle">·</span>
              <span>{formatReading(post.readingMinutes)}</span>
            </>
          )}
          {post.visibility === "private" && <PrivateBadge compact />}
        </div>
        <Link
          to="/posts/$"
          params={{ _splat: post.slug }}
          preload="intent"
          className="mt-1 block font-medium leading-snug text-pretty outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-[var(--ring)]"
        >
          {post.title}
        </Link>
      </div>
      <ArrowRight
        size={16}
        aria-hidden="true"
        className="mt-5 shrink-0 text-subtle transition-[transform,color] duration-300 group-hover:translate-x-0.5 group-hover:text-accent"
      />
    </motion.div>
  );
}
