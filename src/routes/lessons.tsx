import { createFileRoute } from "@tanstack/react-router";
import { LessonsGrid, LessonsGridSkeleton } from "~/components/series/LessonsGrid";
import { EmptyState } from "~/components/ui/States";
import { getFolders, getSeries } from "~/content/functions";
import { formatDuration, plural } from "~/lib/format";
import { enter } from "~/lib/motion";
import { breadcrumbNode, collectionPageNode, itemListNode } from "~/lib/schema";
import { seo, siteUrlFrom } from "~/lib/seo";
import { site } from "~/site.config";

/**
 * ssr: true — a content page: the full series index renders on the server so it is crawlable,
 * shareable and readable before JS.
 */
export const Route = createFileRoute("/lessons")({
  ssr: true,
  loader: async () => {
    const folders = await getFolders();
    const series = await Promise.all(
      folders.map((f) => getSeries({ data: { folder: f.slug } }).catch(() => [])),
    );
    return folders.map((folder, i) => ({
      folder,
      minutes: (series[i] ?? []).reduce((sum, p) => sum + p.readingMinutes, 0),
    }));
  },
  head: ({ matches, loaderData }) => {
    const siteUrl = siteUrlFrom(matches);
    const description =
      "Explore all series in the garden, with multi-part deep dives to read in order.";
    return seo({
      siteUrl,
      title: "Series",
      description,
      path: "/lessons",
      schema: (origin) => {
        const list = itemListNode(
          origin,
          "/lessons",
          (loaderData ?? []).map(({ folder }) => ({
            name: folder.title,
            path: `/series/${folder.slug}`,
          })),
        );
        const crumbs = breadcrumbNode(origin, "/lessons", [
          { name: "Home", path: "/" },
          { name: "Series", path: "/lessons" },
        ]);
        return [
          collectionPageNode(origin, {
            path: "/lessons",
            name: "Series",
            description,
            inLanguage: site.locale,
            breadcrumbId: crumbs["@id"] as string,
            mainEntityId: list["@id"] as string,
          }),
          list,
          crumbs,
        ];
      },
    });
  },
  pendingComponent: () => (
    <main id="main" tabIndex={-1} className="container-page pt-10 sm:pt-14 outline-none">
      <LessonsGridSkeleton className="mt-24" />
    </main>
  ),
  component: LessonsPage,
});

function LessonsPage() {
  const lessons = Route.useLoaderData();
  const parts = lessons.reduce((s, l) => s + l.folder.count, 0);
  const minutes = lessons.reduce((s, l) => s + (l.minutes ?? 0), 0);

  return (
    <main id="main" tabIndex={-1} className="container-page pt-10 pb-8 outline-none sm:pt-14">
      <h1 {...enter(0, "font-serif text-4xl font-medium tracking-tight sm:text-5xl")}>Series</h1>
      {lessons.length > 0 && (
        <p {...enter(1, "mt-2 text-muted")}>
          {lessons.length} series, {plural(parts, "part")}
          {minutes ? `, about ${formatDuration(minutes)} of reading` : ""}.
        </p>
      )}

      {lessons.length === 0 ? (
        <EmptyState className="mt-10" title="No series yet">
          Series appear here once a folder of notes is synced from the vault.
        </EmptyState>
      ) : (
        <LessonsGrid lessons={lessons} className="mt-10" />
      )}
    </main>
  );
}
