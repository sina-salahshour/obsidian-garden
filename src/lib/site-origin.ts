// Picks the canonical origin from a configured list (SITE_URL, comma or space separated). A site served on several domains keeps each one canonical for itself: the request's host
// wins when it is in the list, otherwise the first entry is the primary origin.

/** Splits a configured value into normalised origins ("https://a.com, b.com" -> two https origins). */
export function parseOrigins(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map((v) => v.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .map((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .flatMap((v) => {
      try {
        return [new URL(v).origin];
      } catch {
        return [];
      }
    });
}

/** The listed origin whose host matches `requestHost`, else the first one; null for an empty list. */
export function pickOrigin(origins: string[], requestHost?: string | null): string | null {
  if (origins.length === 0) return null;
  const host = requestHost?.split(",")[0]?.trim().toLowerCase();
  return (host && origins.find((o) => new URL(o).host === host)) || origins[0];
}
