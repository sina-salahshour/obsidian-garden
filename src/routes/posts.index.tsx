import { Link, createFileRoute, stripSearchParams, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { z } from "zod";
import { PostList } from "~/components/post/PostList";
import { ArrowLeft, ArrowRight, Close } from "~/components/ui/icons";
import { PostListSkeleton } from "~/components/ui/Skeleton";
import { EmptyState, buttonStyles } from "~/components/ui/States";
import { FilterPills } from "~/components/ui/TagChip";
import { getFolders, getPosts, getTags } from "~/content/functions";
import { cn } from "~/lib/cn";
import { plural } from "~/lib/format";
import { spring } from "~/lib/motion";
import { breadcrumbNode, collectionPageNode } from "~/lib/schema";
import { seo, siteUrlFrom } from "~/lib/seo";
import { site } from "~/site.config";

const searchSchema = z.object({
  tag: z.string().optional().catch(undefined),
  folder: z.string().optional().catch(undefined),
  sort: z.enum(["newest", "oldest", "title"]).default("newest").catch("newest"),
  page: z.number().int().min(1).default(1).catch(1),
});
const defaults = { sort: "newest", page: 1 } as const;

const PAGE_SIZE = 10;

export const Route = createFileRoute("/posts/")({
  ssr: true,
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [list, tags, folders] = await Promise.all([
      getPosts({ data: { ...deps, pageSize: PAGE_SIZE } }),
      getTags(),
      getFolders(),
    ]);
    return { list, tags, folders };
  },
  // Filtering keeps the current list on screen (dimmed) for quick responses; only slow loads show the skeleton.
  pendingMs: 500,
  pendingMinMs: 250,
  pendingComponent: () => (
    <main className="container-page py-12">
      <PostListSkeleton />
    </main>
  ),
  head: ({ matches, match }) => {
    const siteUrl = siteUrlFrom(matches);
    const tag = match.search.tag;
    const title = tag ? `#${tag}` : "All posts";
    const description = tag ? `Notes tagged #${tag}.` : site.description;
    const path = tag ? `/posts?tag=${encodeURIComponent(tag)}` : "/posts";
    return seo({
      siteUrl,
      title,
      description,
      path,
      schema: (origin) => {
        const crumbs = breadcrumbNode(origin, path, [
          { name: "Home", path: "/" },
          { name: "Notes", path: "/posts" },
          ...(tag ? [{ name: title, path }] : []),
        ]);
        return [
          collectionPageNode(origin, {
            path,
            name: title,
            description,
            inLanguage: site.locale,
            breadcrumbId: crumbs["@id"] as string,
          }),
          crumbs,
        ];
      },
    });
  },
  component: PostsPage,
});

const sortOptions = [
  { value: "newest" as const, label: "Newest" },
  { value: "oldest" as const, label: "Oldest" },
  { value: "title" as const, label: "A–Z" },
];

function PostsPage() {
  const { list, tags, folders } = Route.useLoaderData();
  const search = Route.useSearch();
  const loading = useRouterState({ select: (s) => s.isLoading });
  const seriesTitles = Object.fromEntries(folders.map((f) => [f.folder, f.title]));
  const topTags = tags.toSorted((a, b) => b.count - a.count).slice(0, 16);
  // keep the selected tag visible even when it is not among the most used
  if (search.tag && !topTags.some((t) => t.tag === search.tag)) {
    const found = tags.find((t) => t.tag === search.tag);
    topTags.unshift(found ?? { tag: search.tag, count: 0 });
  }
  const activeFolder = folders.find((f) => f.folder === search.folder || f.slug === search.folder);

  return (
    <main id="main" tabIndex={-1} className="container-page pt-10 pb-8 outline-none sm:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.1em] text-subtle uppercase">Archive</p>
          <h1 className="mt-1.5 font-serif text-4xl font-medium tracking-tight sm:text-5xl">
            {search.tag ? (
              <>
                <span className="text-subtle">#</span>
                {search.tag}
              </>
            ) : activeFolder ? (
              activeFolder.title
            ) : (
              "All posts"
            )}
          </h1>
          <p className="mt-2 text-muted" aria-live="polite">
            {plural(list.total, "note")}
            {search.tag || search.folder ? " match these filters" : " in the garden"}
          </p>
        </div>
        <FilterPills
          label="Sort"
          layoutId="sort-pill"
          value={search.sort}
          options={sortOptions}
          className="sm:mx-0"
          renderOption={(opt, props) => (
            <Link
              from={Route.fullPath}
              search={(prev) => ({ ...prev, sort: opt.value ?? "newest", page: 1 })}
              replace
              resetScroll={false}
              {...props}
            />
          )}
        />
      </header>

      <div className="mt-8 space-y-3 border-y border-line py-4">
        <FilterPills
          label="Filter by tag"
          layoutId="tag-pill"
          value={search.tag}
          options={[
            { value: undefined, label: "All" },
            ...topTags.map((t) => ({ value: t.tag, label: `#${t.tag}`, count: t.count })),
          ]}
          renderOption={(opt, props) => (
            <Link
              from={Route.fullPath}
              search={(prev) => ({ ...prev, tag: opt.value, page: 1 })}
              resetScroll={false}
              {...props}
            />
          )}
        />
        {folders.length > 1 && (
          <FilterPills
            label="Filter by series"
            layoutId="folder-pill"
            value={activeFolder?.folder}
            options={[
              { value: undefined, label: "Every series" },
              ...folders.map((f) => ({ value: f.folder, label: f.title, count: f.count })),
            ]}
            renderOption={(opt, props) => (
              <Link
                from={Route.fullPath}
                search={(prev) => ({ ...prev, folder: opt.value, page: 1 })}
                resetScroll={false}
                {...props}
              />
            )}
          />
        )}
      </div>

      <AnimatePresence initial={false}>
        {(search.tag || search.folder) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring.panel}
            className="overflow-hidden"
          >
            <div className="pt-4">
              <Link
                from={Route.fullPath}
                search={(prev) => ({ ...prev, tag: undefined, folder: undefined, page: 1 })}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-sunken px-3 text-sm text-muted hover:text-fg"
              >
                <Close size={13} /> Clear filters
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={cn("mt-8 transition-opacity duration-300", loading && "opacity-55")}
        aria-busy={loading}
      >
        {list.posts.length ? (
          <PostList posts={list.posts} seriesTitles={seriesTitles} />
        ) : (
          <EmptyState
            title="No notes here"
            action={
              <Link from={Route.fullPath} search={{}} className={buttonStyles.secondary}>
                Show all posts
              </Link>
            }
          >
            Nothing matches these filters yet.
          </EmptyState>
        )}
      </div>

      {list.pageCount > 1 && <Pagination page={list.page} pageCount={list.pageCount} />}
    </main>
  );
}

function pageWindow(page: number, count: number): (number | "…")[] {
  const set = new Set([1, count, page - 1, page, page + 1].filter((p) => p >= 1 && p <= count));
  const sorted = [...set].toSorted((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (const p of sorted) {
    const last = out.at(-1);
    if (typeof last === "number" && p - last > 1) out.push("…");
    out.push(p);
  }
  return out;
}

function Pagination({ page, pageCount }: { page: number; pageCount: number }) {
  const step =
    "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors";
  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link
          from={Route.fullPath}
          search={(prev) => ({ ...prev, page: page - 1 })}
          className={cn(step, "text-muted hover:bg-sunken hover:text-fg")}
          rel="prev"
        >
          <ArrowLeft size={15} /> <span className="max-xs:sr-only">Newer</span>
        </Link>
      ) : (
        <span />
      )}
      <ul className="flex items-center gap-1">
        {pageWindow(page, pageCount).map((p, i) =>
          p === "…" ? (
            <li key={`gap-${i}`} className="px-1 text-subtle">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                from={Route.fullPath}
                search={(prev) => ({ ...prev, page: p })}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "relative inline-flex size-10 items-center justify-center rounded-full text-sm tabular-nums",
                  p === page ? "text-accent-fg" : "text-muted hover:bg-sunken hover:text-fg",
                )}
              >
                {p === page && (
                  <motion.span
                    layoutId="page-pill"
                    transition={spring.layout}
                    className="absolute inset-0 rounded-full bg-accent"
                  />
                )}
                <span className="relative">{p}</span>
              </Link>
            </li>
          ),
        )}
      </ul>
      {page < pageCount ? (
        <Link
          from={Route.fullPath}
          search={(prev) => ({ ...prev, page: page + 1 })}
          className={cn(step, "text-muted hover:bg-sunken hover:text-fg")}
          rel="next"
        >
          <span className="max-xs:sr-only">Older</span> <ArrowRight size={15} />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
