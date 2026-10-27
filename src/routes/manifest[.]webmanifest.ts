// Web app manifest: name, colours and icon for "add to home screen" (linked from the root head).
import { createFileRoute } from "@tanstack/react-router";
import { THEME_COLORS } from "../lib/theme-script.ts";
import { site } from "../site.config.ts";

export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          JSON.stringify({
            name: site.title,
            short_name: site.title,
            description: site.description,
            lang: site.locale,
            start_url: "/",
            display: "standalone",
            background_color: THEME_COLORS.light,
            theme_color: THEME_COLORS.light,
            icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
          }),
          {
            headers: {
              "Content-Type": "application/manifest+json; charset=utf-8",
              "Cache-Control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=604800",
            },
          },
        ),
    },
  },
});
