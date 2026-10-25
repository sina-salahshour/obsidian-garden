// sitemap.xml: home, posts index, tags, series pages and every public note.
import { createFileRoute } from "@tanstack/react-router";
import { indexFor } from "../content/posts.server.ts";
import { resolveSiteUrl } from "../content/site-url.server.ts";

const escapeXml = (value: string) =>
  value.replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = resolveSiteUrl(request);
        const index = indexFor({ isAdmin: false });
        const urls: { loc: string; lastmod?: string }[] = [
          { loc: `${origin}/`, lastmod: index.all[0]?.date },
          { loc: `${origin}/posts` },
          { loc: `${origin}/tags` },
          ...index.folders().map((f) => ({ loc: `${origin}/series/${f.slug}`, lastmod: f.latest })),
          ...index.all
            .filter((m) => !m.isFolderNote)
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
