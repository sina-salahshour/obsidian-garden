// Server-only content data layer. Everything is bundled at build time through import.meta.glob (no
// runtime fs, so it runs on Vercel / Cloudflare). Two indexes: public (anonymous) and full (admin).
import { canViewPrivate } from "./access.server.ts";
import { createIndex, type ContentIndex, type IndexedPost } from "./index-core.ts";
import type { PostMeta, Viewer } from "./types.ts";

const metas = import.meta.glob<PostMeta>("/content/**/*.{md,mdx}", { eager: true, import: "meta" });
const texts = import.meta.glob<string>("/content/**/*.{md,mdx}", {
  eager: true,
  import: "searchText",
});
/** MDX function-body strings of private notes, compiled at build time (see recmaMeta). */
const privateBodies = import.meta.glob<string>("/content/_private/**/*.{md,mdx}", {
  eager: true,
  import: "body",
});

const posts: IndexedPost[] = Object.entries(metas).map(([key, meta]) => ({
  meta,
  text: texts[key] ?? "",
}));

const bodyBySlug = new Map<string, string>();
for (const [key, body] of Object.entries(privateBodies)) {
  const meta = metas[key];
  if (meta && typeof body === "string") bodyBySlug.set(meta.slug, body);
}

let publicIndex: ContentIndex | undefined;
let fullIndex: ContentIndex | undefined;

/** The content index this viewer may see. Private notes do not exist for anonymous viewers. */
export function indexFor(viewer: Viewer): ContentIndex {
  if (canViewPrivate(viewer)) return (fullIndex ??= createIndex(posts));
  return (publicIndex ??= createIndex(posts.filter((p) => p.meta.visibility === "public")));
}

/** Function-body code of a private note, only for viewers allowed to see it. */
export function privateBodyFor(viewer: Viewer, slug: string): string | null {
  if (!canViewPrivate(viewer)) return null;
  return bodyBySlug.get(slug) ?? null;
}
