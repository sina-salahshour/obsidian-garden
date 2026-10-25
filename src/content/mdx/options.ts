// MDX pipeline for content/**/*.{md,mdx}. Imported by vite.config.ts (runs in Node at build time).
// .md is parsed as plain markdown (`format: "detect"`), so Obsidian prose with `<` / `{` is safe;
// .mdx files get full MDX.
import { relative, resolve, sep } from "node:path";
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

export interface PipelineContext {
  catalog: () => Catalog;
  contentPath: (file: FileLike) => string | null;
  attachmentsDir: string;
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
  const shared = { catalog: ctx.catalog, contentPath: ctx.contentPath };
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
      [remarkMeta, { ...shared, attachmentsDir: ctx.attachmentsDir }],
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
