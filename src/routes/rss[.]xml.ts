// RSS 2.0 feed: the 20 newest public notes (folder notes excluded). Absolute URLs. Like the sitemap, it
// leaves out noindex notes and cross-posts whose `canonical` lives elsewhere.
// Each item names its resolved authors (<dc:creator>); the channel carries the site image when set.
import { createFileRoute } from "@tanstack/react-router";
import { indexFor } from "../content/posts.server.ts";
import { resolveSiteUrl } from "../content/site-url.server.ts";
import { escapeXml } from "../lib/xml.ts";
import { resolveAuthors, site } from "../site.config.ts";

export const Route = createFileRoute("/rss.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = resolveSiteUrl(request);
        // Feeds are public and cached by CDNs: always the anonymous view.
        const index = indexFor({ isAdmin: false });
        // index.all is newest first, the same order as list({ sort: "newest" })
        const posts = index.all
          .filter((m) => !m.isFolderNote && !m.noindex && !m.canonical)
          .slice(0, 20);
        const folderAuthors = new Map(index.folders().map((f) => [f.folder, f.authors]));
        const abs = (path: string) => (/^https?:\/\//.test(path) ? path : `${origin}${path}`);
        const items = posts
          .map((p) => {
            const url = `${origin}/posts/${p.slug}`;
            return [
              "    <item>",
              `      <title>${escapeXml(p.title)}</title>`,
              `      <link>${escapeXml(url)}</link>`,
              `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
              `      <pubDate>${new Date(p.date).toUTCString()}</pubDate>`,
              `      <description>${escapeXml(p.description)}</description>`,
              ...resolveAuthors(
                p.authors.length
                  ? p.authors
                  : ((p.folder ? folderAuthors.get(p.folder) : null) ?? []),
              ).map((a) => `      <dc:creator>${escapeXml(a.name)}</dc:creator>`),
              ...p.tags.map((t) => `      <category>${escapeXml(t)}</category>`),
              "    </item>",
            ].join("\n");
          })
          .join("\n");
        const latest = posts[0]?.updated ?? posts[0]?.date;
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(site.title)}</title>
    <link>${escapeXml(origin)}/</link>
    <description>${escapeXml(site.description)}</description>
    <language>${site.locale}</language>
    <atom:link href="${escapeXml(origin)}/rss.xml" rel="self" type="application/rss+xml"/>
${site.image ? `    <image>\n      <url>${escapeXml(abs(site.image))}</url>\n      <title>${escapeXml(site.title)}</title>\n      <link>${escapeXml(origin)}/</link>\n    </image>\n` : ""}${latest ? `    <lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>\n` : ""}${items}
  </channel>
</rss>
`;
        return new Response(xml, {
          headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Cache-Control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=604800",
          },
        });
      },
    },
  },
});
