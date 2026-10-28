/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRoute, useMatches } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { BackToTop } from "~/components/layout/BackToTop";
import { SiteFooter } from "~/components/layout/SiteFooter";
import { SiteHeader } from "~/components/layout/SiteHeader";
import { CommandPalette, type SearchFn } from "~/components/search/CommandPalette";
import { ErrorView, NotFound } from "~/components/ui/States";
import { getSiteUrl, searchPosts } from "~/content/functions";
import { repeatedMetaExtras, seo } from "~/lib/seo";
import { THEME_COLORS, themeScript } from "~/lib/theme";
import { site } from "~/site.config";
import appCss from "~/styles/app.css?url";

const gtmId = import.meta.env.VITE_GTM_ID?.trim();

export const Route = createRootRoute({
  // The absolute origin is resolved once on the server and reused by every route's head() for canonical/og URLs.
  loader: async () => ({ siteUrl: await getSiteUrl() }),
  staleTime: Infinity,
  head: ({ loaderData, match }) => {
    // Site-wide defaults only: every child head() overrides these by name/property. JSON-LD (scripts) is
    // emitted by the leaf route alone so each page carries exactly one @graph.
    // An unmatched URL (or a notFound() no child boundary catches) lands on the root boundary, and an error
    // the root errorComponent renders: neither may be indexed or carry the site title. (Child routes that
    // handle their own notFound set their own noindex head.)
    const failure = match._notFound
      ? "Page not found"
      : match.status === "error"
        ? "Something went wrong"
        : undefined;
    const base = seo({ siteUrl: loaderData?.siteUrl, title: failure, noindex: !!failure });
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "color-scheme", content: "light dark" },
        // theme-color is rendered in RootDocument: head meta is deduped by name, so the pair would collapse.
        { property: "og:site_name", content: site.title },
        { name: "author", content: site.author },
        // og:image size/type describe one specific image: leave them to the page's own seo() so a page with
        // its own image never inherits the default card's dimensions through the per-property merge.
        ...base.meta.filter((m) => !/^og:image:(?:width|height|type)$/.test(m.property ?? "")),
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/manifest.webmanifest" },
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
            <script
              async
              src={`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`}
            />
          </>
        )}
        {/* two theme-colors (one per scheme): written here because head() meta keeps one per name */}
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content={THEME_COLORS.light}
        />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content={THEME_COLORS.dark} />
        <HeadContent />
        <RepeatedMeta />
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

/** The repeated Open Graph values (every article:tag, ...) that HeadContent's per-property dedupe drops. */
function RepeatedMeta() {
  const extras = useMatches({
    select: (matches) => repeatedMetaExtras(matches.map((m) => m.meta)),
  });
  return extras.map((m) => (
    <meta key={`${m.property}:${m.content}`} property={m.property} content={m.content} />
  ));
}

function RootLayout() {
  return <Outlet />;
}
