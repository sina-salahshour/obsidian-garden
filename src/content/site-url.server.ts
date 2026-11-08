// Absolute site origin (server-only): SITE_URL, else the vault's `site: settings` url (site.json),
// else Vercel's production domain, else the request origin, else localhost. SITE_URL may list several
// origins (comma separated); the one matching the request host is used, so every listed domain is
// canonical for itself, and the first is the fallback (see lib/site-origin.ts).
import { getRequest } from "@tanstack/react-start/server";
import { parseOrigins, pickOrigin } from "../lib/site-origin.ts";
import { site } from "../site.config.ts";

export function resolveSiteUrl(request?: Request): string {
  let req = request;
  if (!req) {
    try {
      req = getRequest();
    } catch {
      req = undefined;
    }
  }
  const host = req ? req.headers.get("x-forwarded-host") || new URL(req.url).host : null;
  const configured =
    pickOrigin(parseOrigins(process.env.SITE_URL), host) ??
    pickOrigin(parseOrigins(site.url), host);
  if (configured) return configured;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return req ? new URL(req.url).origin : "http://localhost:3000";
}
