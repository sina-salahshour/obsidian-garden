// Absolute site origin (server-only): SITE_URL, else Vercel's production domain, else the request origin.
import { getRequest } from "@tanstack/react-start/server";

export function resolveSiteUrl(request?: Request): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  let req = request;
  if (!req) {
    try {
      req = getRequest();
    } catch {
      req = undefined;
    }
  }
  return req ? new URL(req.url).origin : "http://localhost:3000";
}
