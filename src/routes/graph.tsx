import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { GraphView, type GraphNodeInfo } from "~/components/graph/GraphView";
import { Skeleton } from "~/components/ui/Skeleton";
import { getFolders, getGraph, getPosts } from "~/content/functions";
import { plural } from "~/lib/format";
import { seo, siteUrlFrom } from "~/lib/seo";

/*
 * ssr: false — the graph is a <canvas> driven by a d3-force simulation, sized from the real
 * viewport and coloured from computed CSS tokens. None of that exists on the server, so
 * server-rendering would only produce an empty box; the loader runs on the client and the
 * server just returns the app shell (with the pending skeleton), keeping the first byte fast.
 */
export const Route = createFileRoute("/graph")({
  ssr: false,
  loader: async () => {
    const [graph, list, folders] = await Promise.all([
      getGraph(),
      getPosts({ data: { pageSize: 100 } }),
      getFolders(),
    ]);
    // details for the hover card: posts give description + reading time, folders describe series starts
    const info: Record<string, GraphNodeInfo> = Object.fromEntries(
      list.posts.map((p) => [
        p.slug,
        { description: p.description, readingMinutes: p.readingMinutes },
      ]),
    );
    for (const f of folders) if (f.indexSlug) info[f.indexSlug] = { description: f.description };
    return { graph, info };
  },
  // noindex: the client-only canvas has no crawlable content (and it stays out of the sitemap).
  head: ({ matches }) =>
    seo({
      siteUrl: siteUrlFrom(matches),
      title: "Graph",
      description: "Every note and how they link to each other.",
      path: "/graph",
      noindex: true,
    }),
  pendingMs: 0,
  pendingComponent: GraphPending,
  component: GraphPage,
});

/** Full-bleed stage: the canvas fills the viewport below the header (minus the phone nav row). */
const stage =
  "relative h-[calc(100dvh-var(--header-h)-2.75rem)] md:h-[calc(100dvh-var(--header-h))] min-h-[26rem]";

/** visually hidden list link that shows as a calm chip, centred below the search, while focused
 * (the global :focus-visible outline supplies the accent ring) */
const noteChip =
  "sr-only focus:not-sr-only focus:absolute focus:top-16 focus:left-1/2 focus:z-30 focus:max-w-[calc(100%-2rem)] focus:-translate-x-1/2 focus:truncate focus:rounded-full focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-fg focus:shadow-[var(--shadow-md)]";

function Title({ meta }: { meta?: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-3 left-3 z-10 max-sm:hidden sm:top-4 sm:left-4">
      <p aria-hidden="true" className="font-serif text-3xl font-medium tracking-tight">
        Graph
      </p>
      {meta && <p className="mt-0.5 text-sm text-muted">{meta}</p>}
    </div>
  );
}

function GraphPending() {
  return (
    <main id="main" tabIndex={-1} className={`${stage} outline-none`}>
      <h1 className="sr-only">Graph</h1>
      <Title />
      <Skeleton className="absolute inset-3 rounded-3xl opacity-60" />
    </main>
  );
}

function GraphPage() {
  const { graph, info } = Route.useLoaderData();
  const navigate = useNavigate();
  const open = useCallback(
    (node: { id: string; isFolderNote: boolean }) =>
      node.isFolderNote
        ? void navigate({ to: "/series/$folder", params: { folder: node.id } })
        : void navigate({ to: "/posts/$", params: { _splat: node.id } }),
    [navigate],
  );
  return (
    <main id="main" tabIndex={-1} className={`${stage} outline-none`}>
      <h1 className="sr-only">Graph</h1>
      <Title
        meta={`${plural(graph.nodes.length, "note")} · ${plural(graph.links.length, "link")}`}
      />
      <GraphView
        data={graph}
        info={info}
        onOpen={open}
        className="absolute inset-0 border-y border-line bg-surface"
      />
      {/*
        the canvas is not accessible; offer the same notes as a plain list. Links stay visually
        hidden until focused, then surface as a small chip over the canvas so sighted keyboard
        users can see where they are. Descriptions reuse only what the graph already received.
      */}
      <nav aria-label="All notes in the graph">
        <ul>
          {graph.nodes.map((n, i) => {
            const descId = `graph-note-desc-${i}`;
            const desc = [
              n.isFolderNote ? "Series start" : null,
              info[n.id]?.description?.replace(/[.!?]+$/, ""),
              plural(n.degree, "link"),
              n.tags.length ? `Tags: ${n.tags.slice(0, 5).join(", ")}` : null,
            ]
              .filter(Boolean)
              .join(". ");
            return (
              <li key={n.id}>
                <Link
                  to={n.isFolderNote ? "/series/$folder" : "/posts/$"}
                  params={n.isFolderNote ? { folder: n.id } : { _splat: n.id }}
                  aria-describedby={descId}
                  className={noteChip}
                >
                  {n.title}
                  {n.isFolderNote && <span className="sr-only"> (series)</span>}
                </Link>
                <span id={descId} className="sr-only">
                  {desc}
                </span>
              </li>
            );
          })}
        </ul>
      </nav>
    </main>
  );
}
