// Web app manifest: name, colours and icons for "add to home screen" (linked from the root head).
// The PNGs in public/ are rendered from public/favicon.svg (the maskable one keeps the mark inside the
// 80% safe zone on a solid background); regenerate them when the logo changes.
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
            id: "/",
            start_url: "/",
            display: "standalone",
            background_color: THEME_COLORS.light,
            theme_color: THEME_COLORS.light,
            icons: [
              { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
              { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
              { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
              {
                src: "/icon-maskable-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
              },
            ],
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
