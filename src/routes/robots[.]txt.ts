// robots.txt: everything is crawlable (noindex pages must stay fetchable so crawlers see their robots
// meta), minus the user agents the vault's `site: settings` note lists in `block-crawlers`.
import { createFileRoute } from "@tanstack/react-router";
import { resolveSiteUrl } from "../content/site-url.server.ts";
import { robotsTxt } from "../lib/robots.ts";
import { site } from "../site.config.ts";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) =>
        new Response(robotsTxt(resolveSiteUrl(request), site.blockCrawlers), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=604800",
          },
        }),
    },
  },
});
