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
 * ssr: true — a content page: the full course index renders on the server so it is crawlable,
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
      "Every course in the garden: multi-part deep dives, meant to be read in order.";
    return seo({
      siteUrl,
      title: "Lessons",
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
          { name: "Lessons", path: "/lessons" },
        ]);
        return [
          collectionPageNode(origin, {
            path: "/lessons",
            name: "Lessons",
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
    <main className="container-page pt-10 sm:pt-14">
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
      <p {...enter(0, "text-xs font-semibold tracking-[0.1em] text-subtle uppercase")}>Courses</p>
      <h1 {...enter(1, "mt-1.5 font-serif text-4xl font-medium tracking-tight sm:text-5xl")}>
        Lessons
      </h1>
      {lessons.length > 0 && (
        <p {...enter(2, "mt-2 text-muted")}>
          {plural(lessons.length, "course")}, {plural(parts, "part")}
          {minutes ? `, about ${formatDuration(minutes)} of reading` : ""}.
        </p>
      )}

      {lessons.length === 0 ? (
        <EmptyState className="mt-10" title="No lessons yet">
          Courses appear here once a folder of notes is synced from the vault.
        </EmptyState>
      ) : (
        <LessonsGrid lessons={lessons} className="mt-10" />
      )}
    </main>
  );
}
