import { Link, createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Reveal, RevealItem } from "~/components/ui/Reveal";
import { TagCloudSkeleton } from "~/components/ui/Skeleton";
import { EmptyState } from "~/components/ui/States";
import { getTags } from "~/content/functions";
import { spotlightHandlers } from "~/lib/hooks";
import { plural } from "~/lib/format";
import { spring } from "~/lib/motion";
import { seo } from "~/lib/seo";

export const Route = createFileRoute("/tags")({
  ssr: true,
  loader: () => getTags(),
  head: ({ matches }) => {
    const siteUrl = (matches[0]?.loaderData as { siteUrl?: string } | undefined)?.siteUrl;
    return seo({
      siteUrl,
      title: "Tags",
      description: "Every topic in the garden, with how often it comes up.",
      path: "/tags",
    });
  },
  pendingComponent: () => (
    <main className="container-page py-14">
      <TagCloudSkeleton count={24} />
    </main>
  ),
  component: TagsPage,
});

function TagsPage() {
  const tags = Route.useLoaderData();
  const sorted = tags.toSorted((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  const max = sorted[0]?.count ?? 1;

  return (
    <main id="main" tabIndex={-1} className="container-page pt-10 pb-8 outline-none sm:pt-14">
      <p className="text-xs font-semibold tracking-[0.1em] text-subtle uppercase">Index</p>
      <h1 className="mt-1.5 font-serif text-4xl font-medium tracking-tight sm:text-5xl">Tags</h1>
      <p className="mt-2 text-muted">{plural(tags.length, "topic")}, most used first.</p>

      {sorted.length === 0 ? (
        <EmptyState className="mt-10" title="No tags yet" />
      ) : (
        <Reveal
          as="ul"
          each={0.018}
          className="mt-10 grid grid-cols-1 gap-2.5 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        >
          {sorted.map((t, i) => (
            <RevealItem as="li" key={t.tag} index={i}>
              <motion.div
                whileHover={{ y: -2 }}
                transition={spring.soft}
                {...spotlightHandlers()}
                className="spotlight glass-edge group relative rounded-xl border"
              >
                <Link to="/posts" search={{ tag: t.tag }} className="block px-4 pt-3.5 pb-3">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">
                      <span className="text-subtle transition-colors group-hover:text-accent">
                        #
                      </span>
                      {t.tag}
                    </span>
                    <span className="text-sm text-muted tabular-nums">{t.count}</span>
                  </span>
                  <span
                    className="mt-3 block h-1 overflow-hidden rounded-full bg-sunken"
                    aria-hidden="true"
                  >
                    <span
                      className="grow block h-full origin-left rounded-full bg-accent/60 transition-colors group-hover:bg-accent"
                      style={
                        {
                          scale: `${Math.max(0.06, t.count / max)} 1`,
                          "--i": i,
                        } as React.CSSProperties
                      }
                    />
                  </span>
                </Link>
              </motion.div>
            </RevealItem>
          ))}
        </Reveal>
      )}
    </main>
  );
}
