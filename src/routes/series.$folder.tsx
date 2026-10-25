import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { Suspense } from "react";
import { PostBody } from "~/components/post/PostBody";
import { SeriesCover } from "~/components/series/SeriesCover";
import { SeriesTimeline } from "~/components/series/SeriesTimeline";
import { ArrowLeft, ArrowRight, Calendar, Clock, Layers } from "~/components/ui/icons";
import { PageSkeleton, Skeleton } from "~/components/ui/Skeleton";
import { NotFound, buttonStyles } from "~/components/ui/States";
import { getFolders, getSeries } from "~/content/functions";
import { loadPost } from "~/content/modules";
import { formatDate, formatDuration, isoDate, plural } from "~/lib/format";
import { enter } from "~/lib/motion";
import { seo } from "~/lib/seo";

export const Route = createFileRoute("/series/$folder")({
  ssr: true,
  loader: async ({ params }) => {
    const folders = await getFolders();
    const folder = folders.find((f) => f.slug === params.folder);
    if (!folder) throw notFound();
    const [parts] = await Promise.all([
      getSeries({ data: { folder: folder.slug } }),
      // preload the course intro (folder note) chunk so SSR renders it without a waterfall
      folder.indexSlug ? loadPost(folder.indexSlug).catch(() => null) : null,
    ]);
    return { folder, parts };
  },
  head: ({ loaderData, matches }) => {
    const siteUrl = (matches[0]?.loaderData as { siteUrl?: string } | undefined)?.siteUrl;
    if (!loaderData) return seo({ siteUrl, title: "Series not found", noindex: true });
    const { folder } = loaderData;
    return seo({
      siteUrl,
      title: folder.title,
      description: folder.description || `${folder.count} parts, in order.`,
      path: `/series/${folder.slug}`,
      image: folder.cover,
    });
  },
  pendingComponent: PageSkeleton,
  notFoundComponent: () => <NotFound title="No such series" />,
  component: SeriesPage,
});

function SeriesPage() {
  const { folder, parts } = Route.useLoaderData();
  const minutes = parts.reduce((s, p) => s + p.readingMinutes, 0);
  const first = parts[0];

  return (
    <main id="main" tabIndex={-1} className="pb-10 outline-none">
      <section className="container-page pt-6 sm:pt-10" aria-labelledby="series-title">
        <SeriesCover
          src={folder.cover}
          svg={folder.coverSvg}
          title={folder.title}
          priority
          className="aspect-[16/10] rounded-3xl shadow-[var(--shadow-md)] sm:aspect-[2.4/1]"
        />
        <div className="mx-auto mt-8 max-w-[44rem] sm:mt-12">
          <div {...enter(0)}>
            <Link
              to="/posts"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg"
            >
              <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />{" "}
              All posts
            </Link>
          </div>
          <p {...enter(1)}>
            <span className="mt-6 inline-flex items-center gap-2 text-xs font-semibold tracking-[0.1em] text-accent-strong uppercase">
              <Layers size={14} /> Series
            </span>
          </p>
          <h1
            id="series-title"
            {...enter(2)}
            className={`mt-2 font-serif text-[2.5rem] leading-[1.06] font-medium tracking-[-0.02em] text-balance sm:text-6xl enter`}
          >
            {folder.title}
          </h1>
          {folder.description && (
            <p
              {...enter(3)}
              className={`mt-5 text-lg leading-relaxed text-pretty text-muted sm:text-xl enter`}
            >
              {folder.description}
            </p>
          )}
          <div {...enter(4)}>
            <dl className="mt-7 grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-surface text-center">
              <Stat label="Parts" icon={<Layers size={14} />} value={String(parts.length)} />
              <Stat
                label="Reading time"
                icon={<Clock size={14} />}
                value={formatDuration(minutes)}
              />
              <Stat
                label="Updated"
                icon={<Calendar size={14} />}
                value={<time dateTime={isoDate(folder.latest)}>{formatDate(folder.latest)}</time>}
              />
            </dl>
            {first && (
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  to="/posts/$"
                  params={{ _splat: first.slug }}
                  className={buttonStyles.primary}
                >
                  Start reading <ArrowRight size={15} />
                </Link>
                <span className="text-sm text-muted">
                  Begins with <span className="text-fg">{first.title}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {folder.indexSlug && (
        <section
          className="container-prose mt-14 border-t border-line pt-12"
          aria-label="Introduction"
        >
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <PostBody slug={folder.indexSlug} />
          </Suspense>
        </section>
      )}

      <section className="container-prose mt-16" aria-labelledby="parts-title">
        <div className="flex items-baseline justify-between">
          <h2 id="parts-title" className="font-serif text-3xl font-medium tracking-tight">
            The parts
          </h2>
          <span className="text-sm text-muted">{plural(parts.length, "part")}</span>
        </div>
        <SeriesTimeline parts={parts} className="mt-6 -ml-1" />
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse items-center gap-1 px-2 py-4">
      <dt className="flex items-center gap-1 text-xs text-subtle">
        <span className="max-xs:hidden">{icon}</span>
        {label}
      </dt>
      <dd className="text-[0.9375rem] font-medium tabular-nums sm:text-lg">{value}</dd>
    </div>
  );
}
