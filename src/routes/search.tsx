import { Link, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Highlight } from "~/components/search/Highlight";
import { Kbd } from "~/components/ui/Badge";
import { ArrowRight, SearchIcon } from "~/components/ui/icons";
import { CardRowSkeleton, Skeleton } from "~/components/ui/Skeleton";
import { EmptyState } from "~/components/ui/States";
import { searchPosts } from "~/content/functions";
import { cn } from "~/lib/cn";
import { findRanges } from "~/lib/highlight";
import { useDebounced } from "~/lib/hooks";
import { ease, spring } from "~/lib/motion";
import { seo, siteUrlFrom } from "~/lib/seo";

/*
 * ssr: "data-only" — the loader runs on the server for the first request, so results arrive with
 * the initial HTML payload (no client round-trip, works for shared links), but the component is
 * rendered only in the browser. The page is an interactive, input-driven UI whose state lives in
 * the URL and changes on every keystroke; server-rendering it buys nothing for readers (search
 * pages are noindex) and would risk hydration flicker between the typed value and the URL.
 */
export const Route = createFileRoute("/search")({
  ssr: "data-only",
  validateSearch: z.object({ q: z.string().default("").catch("") }),
  loaderDeps: ({ search }) => ({ q: search.q.trim() }),
  loader: async ({ deps }) => ({
    q: deps.q,
    hits: deps.q ? await searchPosts({ data: { q: deps.q, limit: 30 } }) : [],
  }),
  head: ({ match, matches }) =>
    seo({
      siteUrl: siteUrlFrom(matches),
      title: match.search.q ? `Search: ${match.search.q}` : "Search",
      noindex: true,
    }),
  pendingMs: 400,
  pendingComponent: SearchPending,
  component: SearchPage,
});

function SearchPending() {
  return (
    <main id="main" tabIndex={-1} className="container-prose pt-10 sm:pt-14 outline-none">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="mt-8 h-14 w-full rounded-2xl" />
      <div className="mt-8">
        <CardRowSkeleton count={4} />
      </div>
    </main>
  );
}

function SearchPage() {
  const { q: urlQ } = Route.useSearch();
  const { hits, q: resultsFor } = Route.useLoaderData();
  const navigate = useNavigate({ from: Route.fullPath });
  const loading = useRouterState({ select: (s) => s.isLoading });
  const [value, setValue] = useState(urlQ);
  const debounced = useDebounced(value, 220);
  const input = useRef<HTMLInputElement>(null);

  // typing -> URL (replace, so Back leaves the page instead of stepping through keystrokes)
  useEffect(() => {
    if (debounced.trim() !== urlQ.trim())
      void navigate({ search: { q: debounced }, replace: true, resetScroll: false });
  }, [debounced, urlQ, navigate]);

  // URL -> input (back/forward, links from the palette)
  useEffect(() => {
    if (urlQ.trim() !== debounced.trim()) setValue(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  return (
    <main id="main" tabIndex={-1} className="container-prose pt-10 pb-8 outline-none sm:pt-14">
      <h1 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">Search</h1>
      <form
        role="search"
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          void navigate({ search: { q: value }, replace: true });
        }}
      >
        <label className="group relative flex items-center">
          <span className="sr-only">Search notes</span>
          <SearchIcon
            size={20}
            className="pointer-events-none absolute left-4 text-subtle transition-colors group-focus-within:text-accent"
          />
          <input
            ref={input}
            type="search"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Fiber, lanes, hooks…"
            spellCheck={false}
            autoComplete="off"
            enterKeyHint="search"
            className="h-14 w-full rounded-2xl border border-line bg-surface pr-12 pl-12 text-lg shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] outline-none placeholder:text-subtle focus:border-ring focus:shadow-[0_0_0_1px_var(--ring),0_0_0_5px_var(--accent-soft)]"
          />
          <AnimatePresence>
            {loading && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, rotate: 360 }}
                exit={{ opacity: 0 }}
                transition={{
                  rotate: { duration: 0.8, repeat: Infinity, ease: "linear" },
                  opacity: { duration: 0.15 },
                }}
                className="absolute right-4 size-4 rounded-full border-2 border-line-strong border-t-accent"
                aria-hidden="true"
              />
            )}
          </AnimatePresence>
        </label>
      </form>

      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {resultsFor ? (
          <>
            {hits.length} {hits.length === 1 ? "result" : "results"} for{" "}
            <span className="font-medium text-fg">“{resultsFor}”</span>
          </>
        ) : (
          <>
            Type to search every note. Tip: press <Kbd>/</Kbd> anywhere to open quick search.
          </>
        )}
      </p>

      <div className={cn("mt-6 transition-opacity duration-200", loading && "opacity-60")}>
        {resultsFor && hits.length === 0 ? (
          <EmptyState title="Nothing found">Try a shorter query, or different words.</EmptyState>
        ) : (
          <ul className="grid gap-2.5">
            <AnimatePresence initial={false} mode="popLayout">
              {hits.map((hit, i) => (
                <motion.li
                  key={hit.slug}
                  layout="position"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.35, ease: ease.out, delay: Math.min(i, 10) * 0.025 },
                  }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={{ layout: spring.layout }}
                >
                  <Link
                    to="/posts/$"
                    params={{ _splat: hit.slug }}
                    className="group block rounded-xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-accent-line"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <Highlight
                        text={hit.title}
                        ranges={findRanges(hit.title, resultsFor)}
                        className="font-medium"
                      />
                      <ArrowRight
                        size={15}
                        className="shrink-0 text-subtle transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-accent"
                      />
                    </span>
                    {hit.excerpt && (
                      <Highlight
                        text={hit.excerpt}
                        ranges={hit.ranges}
                        className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted"
                      />
                    )}
                    {hit.tags.length > 0 && (
                      <span className="mt-2 flex flex-wrap gap-x-2 text-xs text-subtle">
                        {hit.tags.slice(0, 4).map((t) => (
                          <span key={t}>#{t}</span>
                        ))}
                      </span>
                    )}
                  </Link>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </main>
  );
}
