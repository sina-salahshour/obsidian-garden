// RSS 2.0 feed: the 20 newest public notes (folder/course notes excluded). Absolute URLs.
import { createFileRoute } from "@tanstack/react-router";
import { indexFor } from "../content/posts.server.ts";
import { resolveSiteUrl } from "../content/site-url.server.ts";
import { site } from "../site.config.ts";

const escapeXml = (value: string) =>
  value.replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );

export const Route = createFileRoute("/rss.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = resolveSiteUrl(request);
        // Feeds are public and cached by CDNs: always the anonymous view.
        const posts = indexFor({ isAdmin: false }).list({ sort: "newest", pageSize: 20 }).posts;
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
              ...p.tags.map((t) => `      <category>${escapeXml(t)}</category>`),
              "    </item>",
            ].join("\n");
          })
          .join("\n");
        const latest = posts[0]?.updated ?? posts[0]?.date;
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.title)}</title>
    <link>${escapeXml(origin)}/</link>
    <description>${escapeXml(site.description)}</description>
    <language>${site.locale}</language>
    <atom:link href="${escapeXml(origin)}/rss.xml" rel="self" type="application/rss+xml"/>
${latest ? `    <lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>\n` : ""}${items}
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
