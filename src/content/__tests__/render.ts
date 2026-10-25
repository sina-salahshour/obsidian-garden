// Test helper: compiles a note through the real pipeline (in-memory catalog) and renders it to HTML.
import { compile, run } from "@mdx-js/mdx";
import { createElement } from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCatalog, type CatalogSource } from "../mdx/catalog.ts";
import { createMdxOptions } from "../mdx/options.ts";
import type { PostMeta } from "../types.ts";

export const ROOT = "/virtual/content";

export interface Rendered {
  html: string;
  meta: PostMeta;
  searchText: string;
  body?: string;
}

/** `path` is content-relative; `others` are the other notes in content/ (for wikilink resolution). */
export async function renderNote(
  path: string,
  source: string,
  others: CatalogSource[] = [],
): Promise<Rendered> {
  const catalog = buildCatalog([{ path, source }, ...others.filter((o) => o.path !== path)]);
  const {
    mdExtensions: _a,
    mdxExtensions: _b,
    ...options
  } = createMdxOptions({
    catalog: () => catalog,
    contentPath: (file) =>
      file.path?.startsWith(`${ROOT}/`) ? file.path.slice(ROOT.length + 1) : null,
    attachmentsDir: "/virtual/attachments",
  });
  const compiled = await compile(
    { path: `${ROOT}/${path}`, value: source },
    { ...options, format: path.endsWith(".mdx") ? "mdx" : "md", outputFormat: "function-body" },
  );
  const mod = (await run(String(compiled.value), {
    ...runtime,
    baseUrl: import.meta.url,
  })) as unknown as {
    default: (props: Record<string, unknown>) => unknown;
    meta: PostMeta;
    searchText: string;
    body?: string;
  };
  const html = renderToStaticMarkup(createElement(mod.default as never));
  return { html, meta: mod.meta, searchText: mod.searchText, body: mod.body };
}
