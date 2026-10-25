// Server-only access gate. Today every viewer is anonymous, except in development with SHOW_PRIVATE=1.
// A future login replaces getViewer() with a session lookup via getRequest() from
// "@tanstack/react-start/server"; every caller already goes through it.
import type { Viewer } from "./types.ts";

export function getViewer(): Viewer {
  return { isAdmin: process.env.NODE_ENV !== "production" && process.env.SHOW_PRIVATE === "1" };
}

export function canViewPrivate(viewer: Viewer): boolean {
  return viewer.isAdmin;
}
