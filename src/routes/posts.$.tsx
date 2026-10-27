import { Await, Link, createFileRoute, redirect } from "@tanstack/react-router";
import { Suspense, useRef } from "react";
import { ReadingProgress } from "~/components/layout/ReadingProgress";
import { Backlinks, RelatedPosts } from "~/components/post/Backlinks";
import { PostBody } from "~/components/post/PostBody";
import { PrevNext } from "~/components/post/PrevNext";
import { MobileToc, Toc } from "~/components/post/Toc";
import { SeriesProgress } from "~/components/series/SeriesProgress";
import { PrivateBadge } from "~/components/ui/Badge";
import { ArrowLeft, Calendar, Clock, Lock } from "~/components/ui/icons";
import { CardRowSkeleton, PageSkeleton, Skeleton } from "~/components/ui/Skeleton";
import { NotFound } from "~/components/ui/States";
import { TagChip } from "~/components/ui/TagChip";
import { getFolders, getPost, getRelated, getSeries } from "~/content/functions";
import { loadPost } from "~/content/modules";
import { formatDate, formatReading, isoDate } from "~/lib/format";
import { enter } from "~/lib/motion";
import { articleNode, breadcrumbNode } from "~/lib/schema";
import { seo, siteUrlFrom, socialImage } from "~/lib/seo";
import { resolveAuthors, site } from "~/site.config";

export const Route = createFileRoute("/posts/$")({
  ssr: true,
  loader: async ({ params }) => {
    const slug = params._splat ?? "";
    // getPost throws notFound() for unknown/private slugs; loadPost preloads the note's chunk in parallel.
    const [detail, folders] = await Promise.all([
      getPost({ data: { slug } }),
      getFolders(),
      loadPost(slug),
    ]);
    const folder = detail.meta.folder
      ? (folders.find((f) => f.folder === detail.meta.folder) ?? null)
      : null;
    // A folder note is the course landing page: it lives at /series/<slug>.
    if (detail.meta.isFolderNote && folder)
      throw redirect({ to: "/series/$folder", params: { folder: folder.slug }, statusCode: 301 });
    const series = folder ? await getSeries({ data: { folder: folder.slug } }).catch(() => []) : [];
    return {
      ...detail,
      folder,
      series,
      // streamed: rendered with <Await> below the article
      related: getRelated({ data: { slug, limit: 4 } }),
    };
  },
  head: ({ loaderData, matches }) => {
    const siteUrl = siteUrlFrom(matches);
    if (!loaderData) return seo({ siteUrl, title: "Note not found", noindex: true });
    const { meta, folder } = loaderData;
    const path = `/posts/${meta.slug}`;
    const image = socialImage(meta.socialImage, meta.cover, folder?.socialImage, folder?.cover);
    // A part without its own byline inherits the course's authors (then the site's default author).
    const authors = resolveAuthors(meta.authors.length ? meta.authors : (folder?.authors ?? []));
    return seo({
      siteUrl,
      title: meta.title,
      description: meta.description,
      path,
      canonical: meta.canonical,
      image,
      type: "article",
      publishedTime: meta.date,
      modifiedTime: meta.updated,
      tags: meta.tags,
      section: folder?.title,
      authors,
      noindex: meta.visibility === "private" || meta.noindex,
      schema: (origin) => [
        articleNode(origin, {
          type: meta.schemaType ?? (folder ? "TechArticle" : "BlogPosting"),
          path,
          title: meta.title,
          description: meta.description,
          image,
          datePublished: meta.date,
          dateModified: meta.updated,
          authors,
          publisher: site.defaultAuthor,
          tags: meta.tags,
          wordCount: meta.wordCount,
          readingMinutes: meta.readingMinutes,
          inLanguage: site.locale,
          courseSlug: folder?.slug,
          position: meta.order,
          level: meta.level ?? folder?.level,
        }),
        breadcrumbNode(origin, path, [
          { name: "Home", path: "/" },
          ...(folder
            ? [
                { name: "Lessons", path: "/lessons" },
                { name: folder.title, path: `/series/${folder.slug}` },
              ]
            : [{ name: "Notes", path: "/posts" }]),
          { name: meta.title, path },
        ]),
      ],
    });
  },
  pendingComponent: PageSkeleton,
  notFoundComponent: () => <NotFound />,
  component: PostPage,
});

function PostPage() {
  const data = Route.useLoaderData();
  const { meta, prev, next, backlinks, folder, series, related } = data;
  const article = useRef<HTMLElement>(null);
  const isPrivate = meta.visibility === "private";

  return (
    <>
      <ReadingProgress target={article} />
      <main id="main" tabIndex={-1} className="container-page pt-8 pb-10 outline-none sm:pt-12">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_13.5rem] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_15rem] xl:gap-16">
          <article
            ref={article}
            className="mx-auto w-full max-w-[44rem] min-w-0"
            aria-labelledby="post-title"
          >
            <header>
              <nav {...enter(0)} aria-label="Breadcrumb">
                {folder ? (
                  <Link
                    to="/series/$folder"
                    params={{ folder: folder.slug }}
                    className="group inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong"
                  >
                    <ArrowLeft
                      size={14}
                      className="transition-transform group-hover:-translate-x-0.5"
                    />
                    {folder.title}
                  </Link>
                ) : (
                  <Link
                    to="/posts"
                    className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg"
                  >
                    <ArrowLeft
                      size={14}
                      className="transition-transform group-hover:-translate-x-0.5"
                    />{" "}
                    All posts
                  </Link>
                )}
              </nav>

              {isPrivate && (
                <div
                  {...enter(1)}
                  className="enter mt-5 flex items-center gap-2.5 rounded-xl border border-warm/25 bg-warm/8 px-3.5 py-2.5 text-sm text-muted"
                  role="note"
                >
                  <Lock size={15} className="shrink-0 text-warm" />
                  <span>
                    <span className="font-medium text-fg">Only visible to you.</span> This note is
                    private and hidden from everyone else.
                  </span>
                </div>
              )}

              <h1
                id="post-title"
                {...enter(2)}
                className={`mt-5 font-serif text-[2.25rem] leading-[1.1] font-medium tracking-[-0.02em] text-balance sm:text-5xl enter`}
              >
                {meta.title}
              </h1>
              {meta.description && (
                <p
                  {...enter(3)}
                  className={`mt-4 text-lg leading-relaxed text-pretty text-muted sm:text-xl enter`}
                >
                  {meta.description}
                </p>
              )}
              <div {...enter(4)}>
                <dl className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
                  <div className="flex items-center gap-1.5">
                    <dt className="sr-only">Published</dt>
                    <Calendar size={14} className="text-subtle" />
                    <dd>
                      <time dateTime={isoDate(meta.date)}>{formatDate(meta.date)}</time>
                    </dd>
                  </div>
                  {meta.updated && meta.updated.slice(0, 10) !== meta.date.slice(0, 10) && (
                    <div className="flex items-center gap-1.5">
                      <dt>Updated</dt>
                      <dd>
                        <time dateTime={isoDate(meta.updated)}>{formatDate(meta.updated)}</time>
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <dt className="sr-only">Reading time</dt>
                    <Clock size={14} className="text-subtle" />
                    <dd>{formatReading(meta.readingMinutes)}</dd>
                  </div>
                  {isPrivate && <PrivateBadge />}
                </dl>
                {series.length > 1 && folder && (
                  <SeriesProgress
                    className="mt-6"
                    parts={series}
                    currentSlug={meta.slug}
                    seriesTitle={folder.title}
                    seriesSlug={folder.slug}
                  />
                )}
              </div>
            </header>

            <div className="mt-10 border-t border-line pt-10 sm:mt-12 sm:pt-12">
              <Suspense fallback={<BodySkeleton />}>
                <PostBody slug={meta.slug} />
              </Suspense>
            </div>

            <footer className="mt-16 space-y-12">
              {meta.tags.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Tags">
                  {meta.tags.map((t) => (
                    <li key={t}>
                      <TagChip tag={t} size="md" />
                    </li>
                  ))}
                </ul>
              )}
              <PrevNext prev={prev} next={next} />
              <Backlinks posts={backlinks} />
              <Await promise={related} fallback={<RelatedFallback />}>
                {(posts) => {
                  const seen = new Set([prev?.slug, next?.slug, ...backlinks.map((b) => b.slug)]);
                  return (
                    <RelatedPosts posts={posts.filter((p) => !seen.has(p.slug)).slice(0, 4)} />
                  );
                }}
              </Await>
            </footer>
          </article>

          <aside className="hidden lg:block" aria-label="Table of contents">
            <div className="sticky top-[calc(var(--header-h)+2rem)]">
              <Toc headings={meta.headings} />
            </div>
          </aside>
        </div>
      </main>
      <MobileToc headings={meta.headings} />
    </>
  );
}

function BodySkeleton() {
  return (
    <div className="grid gap-3" role="status" aria-label="Loading note">
      {Array.from({ length: 10 }, (_, i) => (
        <Skeleton key={i} className={i % 4 === 3 ? "h-4 w-2/3" : "h-4 w-full"} />
      ))}
    </div>
  );
}

function RelatedFallback() {
  return (
    <div>
      <Skeleton className="h-3 w-28" />
      <div className="mt-4">
        <CardRowSkeleton count={2} />
      </div>
    </div>
  );
}
