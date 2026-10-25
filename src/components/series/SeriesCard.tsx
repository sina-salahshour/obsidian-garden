import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import type { FolderInfo, PostMeta } from "~/content/types";
import { cn } from "~/lib/cn";
import { formatDate, formatDuration, isoDate, partNumber, plural } from "~/lib/format";
import { spotlightHandlers } from "~/lib/hooks";
import { spring } from "~/lib/motion";
import { ArrowRight, Clock, Layers } from "../ui/icons";
import { SeriesCover } from "./SeriesCover";

/**
 * Featured course card on the home page: cover (morphs into the series hero), title,
 * description, stats and the first few parts as a teaser.
 */
export function SeriesCard({
  folder,
  parts,
  className,
}: {
  folder: FolderInfo;
  parts?: PostMeta[];
  className?: string;
}) {
  const minutes = parts?.reduce((sum, p) => sum + p.readingMinutes, 0);
  const teaser = parts?.slice(0, 4) ?? [];
  return (
    <motion.article
      whileHover={{ y: -3 }}
      transition={spring.soft}
      {...spotlightHandlers()}
      className={cn(
        "spotlight group relative grid overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-300 hover:border-line-strong hover:shadow-[var(--shadow-lg)] md:grid-cols-[1.15fr_1fr]",
        className,
      )}
    >
      <SeriesCover
        slug={folder.slug}
        src={folder.cover}
        title={folder.title}
        priority
        className="aspect-[16/9] md:order-2 md:aspect-auto md:min-h-full"
      />
      <div className="flex flex-col p-6 sm:p-8">
        <p className="inline-flex items-center gap-2 text-xs font-medium tracking-wide text-accent-strong uppercase">
          <Layers size={14} /> Series
        </p>
        <h3 className="mt-3 font-serif text-3xl leading-tight font-medium tracking-tight text-balance sm:text-[2.125rem]">
          <Link
            to="/series/$folder"
            params={{ folder: folder.slug }}
            preload="intent"
            className="outline-none after:absolute after:inset-0 after:rounded-3xl focus-visible:after:outline-2 focus-visible:after:outline-[var(--ring)]"
          >
            {folder.title}
          </Link>
        </h3>
        {folder.description && (
          <p className="mt-3 line-clamp-4 leading-relaxed text-pretty text-muted">
            {folder.description}
          </p>
        )}
        <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Parts</dt>
            <Layers size={14} className="text-subtle" />
            <dd>{plural(folder.count, "part")}</dd>
          </div>
          {minutes ? (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Reading time</dt>
              <Clock size={14} className="text-subtle" />
              <dd>{formatDuration(minutes)}</dd>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <dt>Updated</dt>
            <dd>
              <time dateTime={isoDate(folder.latest)}>{formatDate(folder.latest)}</time>
            </dd>
          </div>
        </dl>
        {teaser.length > 0 && (
          <ol
            className="mt-6 space-y-2 border-t border-line pt-5 text-sm max-sm:hidden"
            aria-label="First parts"
          >
            {teaser.map((p) => (
              <li key={p.slug} className="flex gap-3 text-muted">
                <span className="w-6 shrink-0 font-mono text-xs leading-5 text-subtle tabular-nums">
                  {partNumber(p.order ?? 0)}
                </span>
                <span className="line-clamp-1">{p.title}</span>
              </li>
            ))}
          </ol>
        )}
        <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-medium text-fg">
          Start the series
          <ArrowRight
            size={16}
            className="text-accent transition-transform duration-300 group-hover:translate-x-1"
          />
        </span>
      </div>
    </motion.article>
  );
}
