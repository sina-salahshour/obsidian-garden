// MDX pipeline for content/**/*.{md,mdx}. Imported by vite.config.ts (runs in Node at build time).
// .md is parsed as plain markdown (`format: "detect"`), so Obsidian prose with `<` / `{` is safe;
// .mdx files get full MDX.
import { readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Options } from "@mdx-js/rollup";
import rehypeShiki from "@shikijs/rehype";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { loadCatalog, type Catalog } from "./catalog.ts";
import { rehypeCodeDefaults, shikiOptions } from "./shiki.ts";
import { rehypeMeta, remarkMeta } from "./remark-meta.ts";
import remarkObsidian from "./remark-obsidian.ts";
import type { FileLike } from "./unified-types.ts";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
export const contentDir = resolve(root, "content");
export const attachmentsDir = resolve(root, "public", "attachments");

/** content-relative posix path of a file inside content/, else null */
export function contentPathOf(file: FileLike): string | null {
  if (!file.path) return null;
  const rel = relative(contentDir, resolve(file.path.split("?")[0]!));
  if (!rel || rel.startsWith("..") || resolve(rel) === rel) return null;
  return rel.split(sep).join("/");
}

/** Vault-relative paths of every synced file below `dir` (public/attachments), empty when absent. */
export function listAttachments(dir: string): Set<string> {
  const out = new Set<string>();
  const walk = (abs: string, rel: string) => {
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(abs, entry.name), childRel);
      else if (entry.isFile()) out.add(childRel);
    }
  };
  walk(dir, "");
  return out;
}

/** listAttachments, re-read at most once a second so a running dev server sees fresh syncs. */
function cachedAttachments(dir: string): () => ReadonlySet<string> {
  let cache: { at: number; set: Set<string> } | null = null;
  return () => {
    const now = Date.now();
    if (!cache || now - cache.at > 1000) cache = { at: now, set: listAttachments(dir) };
    return cache.set;
  };
}

export interface PipelineContext {
  catalog: () => Catalog;
  contentPath: (file: FileLike) => string | null;
  /** absolute path of public/attachments (the synced output) */
  attachmentsDir: string;
  /** vault-relative attachment paths; defaults to a recursive listing of `attachmentsDir` */
  attachments?: () => ReadonlySet<string>;
}

const base = {
  format: "detect",
  mdExtensions: [".md"],
  mdxExtensions: [".mdx"],
} satisfies Options;

/** The full remark/rehype pipeline. Private notes additionally export `body` (function-body code). */
export function createMdxOptions(
  ctx: PipelineContext,
  { inner = false }: { inner?: boolean } = {},
): Options {
  const shared = {
    catalog: ctx.catalog,
    contentPath: ctx.contentPath,
    attachments: ctx.attachments ?? cachedAttachments(ctx.attachmentsDir),
  };
  const compileBody = inner
    ? undefined
    : async (file: FileLike): Promise<string> => {
        const { compile } = await import("@mdx-js/mdx");
        const {
          mdExtensions: _md,
          mdxExtensions: _mdx,
          ...innerOptions
        } = createMdxOptions(ctx, { inner: true });
        const out = await compile(
          { path: file.path, value: String(file.value) },
          {
            ...innerOptions,
            format: file.path?.endsWith(".mdx") ? "mdx" : "md",
            outputFormat: "function-body",
            development: false,
          },
        );
        return String(out.value);
      };
  return {
    ...base,
    remarkPlugins: [
      remarkFrontmatter,
      [remarkMdxFrontmatter, { name: "frontmatter" }],
      remarkGfm,
      remarkMath,
      [remarkObsidian, shared],
      [remarkMeta, shared],
    ],
    rehypePlugins: [
      rehypeKatex,
      rehypeSlug,
      [rehypeMeta, { compileBody }],
      rehypeCodeDefaults,
      [rehypeShiki, shikiOptions],
    ],
  };
}

export const mdxOptions: Options = createMdxOptions({
  catalog: () => loadCatalog(contentDir),
  contentPath: contentPathOf,
  attachmentsDir,
});
