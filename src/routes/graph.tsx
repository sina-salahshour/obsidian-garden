import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { GraphView, type GraphNodeInfo } from "~/components/graph/GraphView";
import { Skeleton } from "~/components/ui/Skeleton";
import { getFolders, getGraph, getPosts } from "~/content/functions";
import { plural } from "~/lib/format";
import { seo } from "~/lib/seo";

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
  head: () =>
    seo({
      title: "Graph",
      description: "Every note and how they link to each other.",
      path: "/graph",
    }),
  pendingMs: 0,
  pendingComponent: GraphPending,
  component: GraphPage,
});

/** Full-bleed stage: the canvas fills the viewport below the header (minus the phone nav row). */
const stage =
  "relative h-[calc(100dvh-var(--header-h)-2.75rem)] md:h-[calc(100dvh-var(--header-h))] min-h-[26rem]";

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
    <main id="main" className={stage}>
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
      {/* the canvas is not accessible; offer the same notes as a plain list */}
      <nav aria-label="All notes in the graph" className="sr-only">
        <ul>
          {graph.nodes.map((n) => (
            <li key={n.id}>
              {n.isFolderNote ? (
                <Link to="/series/$folder" params={{ folder: n.id }}>
                  {n.title} (series)
                </Link>
              ) : (
                <Link to="/posts/$" params={{ _splat: n.id }}>
                  {n.title}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
