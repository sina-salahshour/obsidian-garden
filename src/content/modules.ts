// Isomorphic MDX module loader. Public notes are lazy chunks (the glob never matches content/_private,
// so private notes can't be fetched by guessing chunk URLs). Private notes are fetched as compiled
// function-body code through the admin-gated getPrivateBody server fn and evaluated with @mdx-js/mdx `run`.
import { notFound } from "@tanstack/react-router";
import type { MDXContent } from "mdx/types";
import { getPrivateBody } from "./functions.ts";
import { slugEntries } from "./slug.ts";

const loaders = import.meta.glob<MDXContent>(["/content/**/*.{md,mdx}", "!/content/_private/**"], {
  import: "default",
});

const loaderBySlug = new Map<string, () => Promise<MDXContent>>();
for (const entry of slugEntries(Object.keys(loaders)))
  loaderBySlug.set(entry.slug, loaders[entry.key]!);

const pending = new Map<string, Promise<MDXContent>>();
const loaded = new Map<string, MDXContent>();

async function loadPrivate(slug: string): Promise<MDXContent> {
  const { code } = await getPrivateBody({ data: { slug } });
  const [{ run }, runtime] = await Promise.all([
    import("@mdx-js/mdx"),
    import("react/jsx-runtime"),
  ]);
  const mod = await run(code, { ...runtime, baseUrl: import.meta.url });
  return mod.default;
}

/** true when the slug is a public note bundled as a lazy chunk */
export function isPublicModule(slug: string): boolean {
  return loaderBySlug.has(slug);
}

/**
 * Resolves the note's MDX component (memoized per slug). Call it in the route loader so the chunk is
 * preloaded, then `use(loadPost(slug))` or getLoadedPost(slug) in the component. Unknown slug (or a
 * private one the viewer may not see) -> notFound().
 */
export function loadPost(slug: string): Promise<MDXContent> {
  const hit = pending.get(slug);
  if (hit) return hit;
  const loader = loaderBySlug.get(slug);
  if (!loader && typeof window === "undefined") {
    // Private notes depend on who is asking: never share them through the server's module-level cache.
    return loadPrivate(slug);
  }
  const promise = (loader ? loader() : loadPrivate(slug)).then(
    (component) => {
      if (typeof component !== "function") throw notFound();
      loaded.set(slug, component);
      return component;
    },
    (error: unknown) => {
      pending.delete(slug);
      throw error;
    },
  );
  pending.set(slug, promise);
  return promise;
}

/** The component once loadPost(slug) has resolved, else undefined. */
export function getLoadedPost(slug: string): MDXContent | undefined {
  return loaded.get(slug);
}
