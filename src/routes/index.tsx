import { Await, Link, createFileRoute } from "@tanstack/react-router";
import { animate, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useState } from "react";
import { PostList } from "~/components/post/PostList";
import { SeriesCard } from "~/components/series/SeriesCard";
import { ArrowRight } from "~/components/ui/icons";
import { Reveal, RevealItem } from "~/components/ui/Reveal";
import { PostListSkeleton, TagCloudSkeleton } from "~/components/ui/Skeleton";
import { buttonStyles, EmptyState } from "~/components/ui/States";
import { TagChip } from "~/components/ui/TagChip";
import { getFolders, getPosts, getSeries, getTags } from "~/content/functions";
import { useMediaQuery } from "~/lib/hooks";
import { duration, enter } from "~/lib/motion";
import { seo, siteUrlFrom } from "~/lib/seo";
import { site } from "~/site.config";

export const Route = createFileRoute("/")({
  ssr: true,
  loader: async () => {
    const [folders, recent] = await Promise.all([
      getFolders(),
      getPosts({ data: { sort: "newest", pageSize: 6 } }),
    ]);
    const featured = folders.slice(0, 3);
    const series = await Promise.all(
      featured.map((f) => getSeries({ data: { folder: f.slug } }).catch(() => [])),
    );
    return {
      featured: featured.map((folder, i) => ({ folder, parts: series[i] ?? [] })),
      recent,
      // Not awaited: the tag cloud streams in after the first byte (rendered with <Await> + skeleton).
      tags: getTags(),
    };
  },
  head: ({ matches }) => {
    const siteUrl = siteUrlFrom(matches);
    return seo({ siteUrl, path: "/" });
  },
  pendingComponent: () => (
    <main id="main" tabIndex={-1} className="container-page py-16 outline-none">
      <PostListSkeleton count={3} />
    </main>
  ),
  component: Home,
});

function Home() {
  const { featured, recent, tags } = Route.useLoaderData();
  const seriesTitles = Object.fromEntries(featured.map((f) => [f.folder.folder, f.folder.title]));
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <Hero />

      {featured.length > 0 && (
        <section aria-labelledby="series-title" className="container-page mt-4 sm:mt-8">
          <SectionHeading id="series-title" eyebrow="Courses">
            Series
          </SectionHeading>
          <Reveal className="mt-6 grid gap-6" delay={0.1}>
            {featured.map(({ folder, parts }, i) => (
              <RevealItem key={folder.slug} index={i + 3}>
                <SeriesCard folder={folder} parts={parts} />
              </RevealItem>
            ))}
          </Reveal>
        </section>
      )}

      <section aria-labelledby="recent-title" className="container-page mt-20">
        <div className="flex items-end justify-between gap-4">
          <SectionHeading id="recent-title" eyebrow="Latest">
            Recent notes
          </SectionHeading>
          <Link
            to="/posts"
            className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted hover:text-fg"
          >
            All {recent.total} posts
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        {recent.posts.length ? (
          <PostList
            posts={recent.posts}
            seriesTitles={seriesTitles}
            className="mt-6 md:grid-cols-2"
          />
        ) : (
          <EmptyState className="mt-6" title="Nothing published yet">
            Notes appear here as soon as they are synced from the vault.
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="topics-title" className="container-page mt-20">
        <SectionHeading id="topics-title" eyebrow="Explore">
          Topics
        </SectionHeading>
        <div className="mt-6">
          <Await promise={tags} fallback={<TagCloudSkeleton />}>
            {(list) => <TagCloud tags={list} />}
          </Await>
        </div>
      </section>
    </main>
  );
}

const headingHoldMs = 4000;
const cipherGlyphs = "abcdefghkmnorstuvxyz23456789";

function Hero() {
  const titles = site.heroTitle;
  const firstTitle = titles[0] ?? site.title;
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  const [paused, setPaused] = useState(false);
  const [titleIndex, setTitleIndex] = useState(0);
  const [cipher, setCipher] = useState<string | null>(null);
  const visibleTitle = reducedMotion ? firstTitle : (cipher ?? titles[titleIndex] ?? firstTitle);

  useEffect(() => {
    if (titles.length < 2 || paused || reducedMotion) return;
    const nextIndex = (titleIndex + 1) % titles.length;
    const nextTitle = titles[nextIndex]!;
    let animation: AnimationPlaybackControls | undefined;
    const timer = window.setTimeout(() => {
      const letters = Array.from(nextTitle);
      let lastFrame = -1;
      animation = animate(0, 1, {
        duration: duration.slow,
        ease: "linear",
        onUpdate: (progress) => {
          const frame = Math.floor(progress * 16);
          if (frame === lastFrame) return;
          lastFrame = frame;
          const revealed = Math.floor((frame / 16) * letters.length);
          setCipher(
            letters
              .map((letter, i) =>
                i < revealed || !/[A-Za-z0-9]/.test(letter)
                  ? letter
                  : cipherGlyphs[(i * 13 + frame * 7) % cipherGlyphs.length],
              )
              .join(""),
          );
        },
        onComplete: () => {
          setTitleIndex(nextIndex);
          setCipher(null);
        },
      });
    }, headingHoldMs);
    return () => {
      window.clearTimeout(timer);
      animation?.stop();
    };
  }, [paused, reducedMotion, titleIndex, titles]);

  return (
    <section className="container-page pt-10 pb-8 sm:pt-16 sm:pb-10" aria-labelledby="hero-title">
      <div
        {...enter(
          0,
          "grid max-w-[30ch] font-serif text-[clamp(1.75rem,7.5vw,3.25rem)] leading-[1.12] font-normal tracking-[-0.01em] text-balance [overflow-wrap:anywhere]",
        )}
      >
        <h1 id="hero-title" className="col-start-1 row-start-1">
          {visibleTitle === firstTitle ? (
            firstTitle
          ) : (
            <>
              <span className="sr-only">{firstTitle}</span>
              <span aria-hidden="true">{visibleTitle}</span>
            </>
          )}
        </h1>
        {/* Keep the introduction in place as the headings wrap to different lengths. */}
        {titles.map((title) => (
          <span key={title} aria-hidden="true" className="invisible col-start-1 row-start-1">
            {title}
          </span>
        ))}
      </div>
      <p
        {...enter(
          1,
          "mt-4 max-w-[58ch] text-lg leading-relaxed text-pretty text-muted [overflow-wrap:anywhere]",
        )}
      >
        {site.heroDescription}
      </p>
      <div {...enter(2, "mt-6 flex items-center gap-2")}>
        <Link to="/posts" className={buttonStyles.primary}>
          Browse notes <ArrowRight size={15} />
        </Link>
        {titles.length > 1 && !reducedMotion && (
          <button
            type="button"
            aria-label={paused ? "Resume headline rotation" : "Pause headline rotation"}
            title={paused ? "Resume headline rotation" : "Pause headline rotation"}
            onClick={() => {
              setCipher(null);
              setPaused(!paused);
            }}
            className="inline-grid size-11 place-items-center rounded-full text-subtle transition-colors hover:bg-sunken hover:text-fg"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <path d={paused ? "M5 3.5v9L12 8Z" : "M5 3.5h2v9H5zM9 3.5h2v9H9z"} />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}

function SectionHeading({
  id,
  eyebrow,
  children,
}: {
  id: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.1em] text-subtle uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-1.5 font-serif text-3xl font-medium tracking-tight">
        {children}
      </h2>
    </div>
  );
}

function TagCloud({ tags }: { tags: { tag: string; count: number }[] }) {
  if (!tags.length) return <p className="text-muted">No tags yet.</p>;
  const top = tags.toSorted((a, b) => b.count - a.count).slice(0, 28);
  return (
    <Reveal as="ul" each={0.02} className="flex flex-wrap gap-2">
      {top.map((t, i) => (
        <RevealItem as="li" key={t.tag} index={i}>
          <TagChip tag={t.tag} count={t.count} size="md" />
        </RevealItem>
      ))}
      <RevealItem as="li" index={top.length}>
        <Link
          to="/tags"
          className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted hover:text-fg"
        >
          All tags <ArrowRight size={14} />
        </Link>
      </RevealItem>
    </Reveal>
  );
}
