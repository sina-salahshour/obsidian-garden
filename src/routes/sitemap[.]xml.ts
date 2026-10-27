// sitemap.xml: home, posts index, tag pages, tags, lessons index, series pages and every public note.
// Left out: noindex notes/series, cross-posts with a `canonical` elsewhere, /search and /graph (noindex).
import { createFileRoute } from "@tanstack/react-router";
import { indexFor } from "../content/posts.server.ts";
import { resolveSiteUrl } from "../content/site-url.server.ts";
import { escapeXml } from "../lib/xml.ts";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = resolveSiteUrl(request);
        const index = indexFor({ isAdmin: false });
        const folders = index.folders().filter((f) => !f.noindex);
        const urls: { loc: string; lastmod?: string }[] = [
          { loc: `${origin}/`, lastmod: index.all[0]?.date },
          { loc: `${origin}/posts` },
          ...index.tags().map((t) => ({ loc: `${origin}/posts?tag=${encodeURIComponent(t.tag)}` })),
          { loc: `${origin}/tags` },
          {
            loc: `${origin}/lessons`,
            lastmod: folders
              .map((f) => f.latest)
              .toSorted()
              .at(-1),
          },
          ...folders.map((f) => ({ loc: `${origin}/series/${f.slug}`, lastmod: f.latest })),
          ...index.all
            .filter((m) => !m.isFolderNote && !m.noindex && !m.canonical)
            .map((m) => ({ loc: `${origin}/posts/${m.slug}`, lastmod: m.updated ?? m.date })),
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
