import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { PostMeta } from "~/content/types";
import { cn } from "~/lib/cn";
import { formatDate, formatReading, humanize, isoDate, partNumber } from "~/lib/format";
import { useCardHover } from "~/lib/hooks";
import { duration, spring } from "~/lib/motion";
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
  const peek = usePeek(post.tags.length > maxTags);
  return (
    <motion.article
      {...hover}
      ref={peek.cardRef}
      onPointerEnter={peek.onPointerEnter}
      onPointerLeave={() => {
        hover.onPointerLeave();
        peek.close();
      }}
      onFocus={peek.onFocus}
      onBlur={peek.close}
      onKeyDown={(e) => e.key === "Escape" && peek.close()}
      className={cn(
        // fixed height (see the text block below); the full text lives in the peek popover
        "spotlight glass-edge group relative flex h-full flex-col rounded-2xl p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] sm:p-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-x-2 text-xs whitespace-nowrap text-muted">
        {inSeries && (
          <>
            <span className="min-w-0 truncate font-medium text-accent-strong">
              {seriesTitle ?? humanize(post.folder!)} · Part {partNumber(post.order!)}
            </span>
            <span aria-hidden="true" className="text-subtle">
              ·
            </span>
          </>
        )}
        <time dateTime={isoDate(post.date)} className="shrink-0">
          {formatDate(post.date)}
        </time>
        <span aria-hidden="true" className="text-subtle">
          ·
        </span>
        <span className="shrink-0">{formatReading(post.readingMinutes)}</span>
        {post.visibility === "private" && <PrivateBadge className="ml-1 shrink-0" />}
      </div>
      {/* min height = a two-line title + two description lines, so every card is the same height;
          a short title lets the description rise and the slack collects above the tags instead */}
      <div className="mt-3 min-h-[calc(2*1.375rem*1.375+0.5rem+2*0.9375rem*1.625)] sm:min-h-[calc(2*1.5rem*1.375+0.5rem+2*0.9375rem*1.625)]">
        <H
          ref={peek.titleRef}
          className="line-clamp-2 font-serif text-[1.375rem] leading-snug font-medium tracking-tight text-balance sm:text-2xl"
        >
          <Link
            to="/posts/$"
            params={{ _splat: post.slug }}
            preload="intent"
            className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--ring)]"
          >
            {post.title}
          </Link>
        </H>
        <p
          ref={peek.descRef}
          className="mt-2 line-clamp-2 text-[0.9375rem] leading-relaxed text-pretty text-muted"
        >
          {post.description}
        </p>
      </div>
      <div className="mt-auto flex items-end justify-between gap-4 pt-4">
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
      <AnimatePresence>
        {peek.side && (
          // A visual echo of text the card already holds (clamped, not removed), so it is hidden from
          // assistive tech and never takes the pointer: clicks still land on the card beneath.
          <motion.div
            aria-hidden="true"
            data-peek=""
            key="peek"
            initial={{ opacity: 0, scale: 0.97, y: peek.side === "below" ? -6 : 6 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: spring.panel }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: duration.fast } }}
            className={cn(
              "pointer-events-none absolute inset-x-3 z-30 rounded-xl border border-line-strong bg-surface p-4 shadow-[var(--shadow-lg)] sm:inset-x-4",
              peek.side === "below"
                ? "top-[calc(100%+0.5rem)] origin-top"
                : "bottom-[calc(100%+0.5rem)] origin-bottom",
            )}
          >
            <p className="font-serif text-lg leading-snug font-medium tracking-tight text-pretty">
              {post.title}
            </p>
            {post.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-pretty text-muted">
                {post.description}
              </p>
            )}
            {post.tags.length > 0 && (
              <p className="mt-3 flex flex-wrap gap-x-2.5 gap-y-1 border-t border-line pt-2.5 text-xs text-subtle">
                {post.tags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

/** Room the peek needs below the card before it flips above (px). */
const PEEK_ROOM = 240;
/** Hover intent: a pass-over on the way elsewhere should not flash a popover. */
const PEEK_DELAY = 420;

/**
 * The card's "peek": a popover with the full title, description and tags, shown on mouse hover
 * (after a short intent delay) or keyboard focus, and only when the card actually clamps
 * something. Touch never opens it; the post itself is one tap away.
 */
function usePeek(hiddenTags: boolean) {
  const cardRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [side, setSide] = useState<"above" | "below" | null>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const clamped = (el: HTMLElement | null) => !!el && el.scrollHeight > el.clientHeight + 1;
  const open = () => {
    const card = cardRef.current;
    if (!card || !(hiddenTags || clamped(titleRef.current) || clamped(descRef.current))) return;
    const r = card.getBoundingClientRect();
    setSide(window.innerHeight - r.bottom >= PEEK_ROOM || r.top < PEEK_ROOM ? "below" : "above");
  };
  const close = () => {
    clearTimeout(timer.current);
    setSide(null);
  };
  return {
    cardRef,
    titleRef,
    descRef,
    side,
    close,
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(timer.current);
      timer.current = setTimeout(open, PEEK_DELAY);
    },
    onFocus: (e: React.FocusEvent) => {
      // keyboard only: a mouse click also focuses the link, and the popover would flash on the way out
      if (e.target.matches(":focus-visible")) open();
    },
  };
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
  const hover = useCardHover({ pull: 2 });
  return (
    <motion.div
      {...hover}
      className={cn(
        "spotlight glass-edge group relative flex items-start gap-3 rounded-xl px-4 py-3.5",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted">
          {eyebrow ?? (
            <>
              <time dateTime={isoDate(post.date)}>{formatDate(post.date)}</time>
              <span aria-hidden="true" className="text-subtle">
                ·
              </span>
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
