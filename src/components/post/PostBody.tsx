import { useRouter } from "@tanstack/react-router";
import type { MDXContent } from "mdx/types";
import { use } from "react";
import { getLoadedPost, loadPost } from "~/content/modules";
import { mdxComponents, ProseBody } from "../mdx";

// Per-router (= per request on the server) promise cache, so `use()` sees a stable promise even for
// notes that loadPost() deliberately does not memoize server-side (private notes).
const cache = new WeakMap<object, Map<string, Promise<MDXContent>>>();
function cachedLoad(router: object, slug: string): Promise<MDXContent> {
  let m = cache.get(router);
  if (!m) cache.set(router, (m = new Map()));
  let p = m.get(slug);
  if (!p) m.set(slug, (p = loadPost(slug)));
  return p;
}

/** Renders a note's compiled MDX body with the site's element overrides. */
export function PostBody({ slug, className }: { slug: string; className?: string }) {
  const router = useRouter();
  const Content = getLoadedPost(slug) ?? use(cachedLoad(router, slug));
  return (
    <ProseBody className={className}>
      <Content components={mdxComponents} />
    </ProseBody>
  );
}
