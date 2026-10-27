// robots.txt body (pure, so it can be unit tested).

/** Allow everyone, then one `Disallow: /` block per blocked user agent, then the sitemap. */
export function robotsTxt(origin: string, blockCrawlers: readonly string[]): string {
  const blocks = [
    ["User-agent: *", "Allow: /"],
    ...blockCrawlers.map((agent) => [`User-agent: ${agent}`, "Disallow: /"]),
  ];
  return `${blocks.map((b) => b.join("\n")).join("\n\n")}\n\nSitemap: ${origin}/sitemap.xml\n`;
}
