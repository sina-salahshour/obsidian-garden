/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { BackToTop } from "~/components/layout/BackToTop";
import { SiteFooter } from "~/components/layout/SiteFooter";
import { SiteHeader } from "~/components/layout/SiteHeader";
import { CommandPalette, type SearchFn } from "~/components/search/CommandPalette";
import { ErrorView, NotFound } from "~/components/ui/States";
import { getSiteUrl, searchPosts } from "~/content/functions";
import { seo } from "~/lib/seo";
import { THEME_COLORS, themeScript } from "~/lib/theme";
import { site } from "~/site.config";
import appCss from "~/styles/app.css?url";

const gtmId = import.meta.env.VITE_GTM_ID?.trim();

export const Route = createRootRoute({
  // The absolute origin is resolved once on the server and reused by every route's head() for canonical/og URLs.
  loader: async () => ({ siteUrl: await getSiteUrl() }),
  staleTime: Infinity,
  head: ({ loaderData }) => {
    const base = seo({ siteUrl: loaderData?.siteUrl });
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "color-scheme", content: "light dark" },
        {
          name: "theme-color",
          media: "(prefers-color-scheme: light)",
          content: THEME_COLORS.light,
        },
        { name: "theme-color", media: "(prefers-color-scheme: dark)", content: THEME_COLORS.dark },
        { property: "og:site_name", content: site.title },
        { property: "og:locale", content: site.locale },
        { name: "author", content: site.author },
        ...base.meta,
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "alternate", type: "application/rss+xml", title: site.title, href: "/rss.xml" },
      ],
    };
  },
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: () => <NotFound />,
  errorComponent: ({ error, reset }) => <ErrorView error={error} reset={reset} />,
});

const search: SearchFn = (q) => searchPosts({ data: { q, limit: 12 } });

function RootDocument({ children }: { children: ReactNode }) {
  return (
    // data-theme / color-scheme are written by the inline script before paint, so the server markup differs on purpose
    <html lang={site.locale} suppressHydrationWarning>
      <head>
        {/* must run before first paint: no theme flash */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {gtmId && (
          <>
            <script
              dangerouslySetInnerHTML={{
                __html:
                  "window.dataLayer = window.dataLayer || []; window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });",
              }}
            />
            <script async src={`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`} />
          </>
        )}
        <HeadContent />
      </head>
      <body>
        {gtmId && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtmId)}`}
              height="0"
              width="0"
              title="Google Tag Manager"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}
        <MotionConfig reducedMotion="user">
          <div className="flex min-h-dvh flex-col">
            <SiteHeader />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </div>
          <CommandPalette search={search} />
          <BackToTop />
        </MotionConfig>
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  return <Outlet />;
}
