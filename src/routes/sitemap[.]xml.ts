// sitemap.xml: home, posts index, tag pages, tags, lessons index, series pages and every public note.
// Left out: noindex notes/series, cross-posts with a `canonical` elsewhere, /search and /graph (noindex),
// and tags carried only by left-out notes. lastmod is the newest `updated ?? date` of what the page lists.
import { createFileRoute } from "@tanstack/react-router";
import { indexFor } from "../content/posts.server.ts";
import { resolveSiteUrl } from "../content/site-url.server.ts";
import type { PostMeta } from "../content/types.ts";
import { escapeXml } from "../lib/xml.ts";

const modified = (m: PostMeta) => m.updated ?? m.date;
/** newest ISO date of the notes (ISO strings sort chronologically) */
const newest = (notes: readonly PostMeta[]) => notes.map(modified).toSorted().at(-1);

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = resolveSiteUrl(request);
        const index = indexFor({ isAdmin: false });
        const folders = index.folders().filter((f) => !f.noindex);
        const notes = index.all.filter((m) => !m.isFolderNote && !m.noindex && !m.canonical);
        const tags = [...new Set(notes.flatMap((m) => m.tags))].toSorted();
        const seriesLastmod = new Map(
          folders.map((f) => {
            const note = f.indexSlug ? index.get(f.indexSlug) : undefined;
            return [f.slug, newest([...(index.series(f.slug) ?? []), ...(note ? [note] : [])])];
          }),
        );
        const urls: { loc: string; lastmod?: string }[] = [
          { loc: `${origin}/`, lastmod: newest(index.all) },
          { loc: `${origin}/posts` },
          ...tags.map((t) => ({ loc: `${origin}/posts?tag=${encodeURIComponent(t)}` })),
          { loc: `${origin}/tags` },
          {
            loc: `${origin}/lessons`,
            lastmod: [...seriesLastmod.values()]
              .filter((d): d is string => !!d)
              .toSorted()
              .at(-1),
          },
          ...folders.map((f) => ({
            loc: `${origin}/series/${f.slug}`,
            lastmod: seriesLastmod.get(f.slug),
          })),
          ...notes.map((m) => ({ loc: `${origin}/posts/${m.slug}`, lastmod: modified(m) })),
        ];
        const body = urls
          .map(
            (u) =>
              `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ""}</url>`,
          )
          .join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=604800",
          },
        });
      },
    },
  },
});
