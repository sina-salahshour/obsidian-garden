// Typed server functions: the only way the UI reads content data. Every handler resolves the viewer
// first, so private notes never leave the server for anonymous viewers (getPost -> notFound()).
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getViewer } from "./access.server.ts";
import { indexFor, privateBodyFor } from "./posts.server.ts";
import { resolveSiteUrl } from "./site-url.server.ts";
import type {
  FolderInfo,
  GraphData,
  PostDetail,
  PostListResult,
  PostMeta,
  SearchHit,
  TagCount,
} from "./types.ts";

const slugSchema = z.string().min(1).max(300);

export const getPosts = createServerFn({ method: "GET" })
  .validator(
    z.object({
      tag: z.string().max(100).optional(),
      folder: z.string().max(200).optional(),
      sort: z.enum(["newest", "oldest", "title"]).optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }),
  )
  .handler(({ data }): PostListResult => indexFor(getViewer()).list(data));

export const getPost = createServerFn({ method: "GET" })
  .validator(z.object({ slug: slugSchema }))
  .handler(({ data }): PostDetail => {
    const detail = indexFor(getViewer()).detail(data.slug);
    if (!detail) throw notFound();
    return detail;
  });

export const getRelated = createServerFn({ method: "GET" })
  .validator(z.object({ slug: slugSchema, limit: z.number().int().min(0).max(20).optional() }))
  .handler(({ data }): PostMeta[] => indexFor(getViewer()).related(data.slug, data.limit ?? 3));

export const getTags = createServerFn({ method: "GET" }).handler((): TagCount[] =>
  indexFor(getViewer()).tags(),
);

export const getFolders = createServerFn({ method: "GET" }).handler((): FolderInfo[] =>
  indexFor(getViewer()).folders(),
);

/** Parts of a series by FOLDER SLUG, ordered by `order` then title (folder note excluded). */
export const getSeries = createServerFn({ method: "GET" })
  .validator(z.object({ folder: z.string().min(1).max(200) }))
  .handler(({ data }): PostMeta[] => {
    const parts = indexFor(getViewer()).series(data.folder);
    if (!parts) throw notFound();
    return parts;
  });

export const searchPosts = createServerFn({ method: "GET" })
  .validator(
    z.object({
      q: z.string().max(200),
      tag: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
  )
  .handler(({ data }): SearchHit[] =>
    indexFor(getViewer()).search(data.q, { tag: data.tag, limit: data.limit ?? 20 }),
  );

export const getGraph = createServerFn({ method: "GET" }).handler((): GraphData =>
  indexFor(getViewer()).graph(),
);

/** Compiled MDX function-body of a private note; notFound() unless the viewer may see it. */
export const getPrivateBody = createServerFn({ method: "GET" })
  .validator(z.object({ slug: slugSchema }))
  .handler(({ data }): { code: string } => {
    const code = privateBodyFor(getViewer(), data.slug);
    if (code === null) throw notFound();
    return { code };
  });

/** Absolute site origin for canonical URLs / og tags (SITE_URL, Vercel production URL, or request origin). */
export const getSiteUrl = createServerFn({ method: "GET" }).handler((): string => resolveSiteUrl());
