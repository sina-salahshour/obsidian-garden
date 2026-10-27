// Computes `meta: PostMeta` for every note and exports it from the compiled module.
//   remarkMeta        (mdast, after remark-obsidian): frontmatter, title, H1 removal, description,
//                     word count, tags, links, visibility, folder-note info, search text.
//   rehypeMeta        (hast, after rehype-slug): h2-h4 with their final ids, then appends an ESM node
//                     `export const meta = {...}` + `searchText` (+ `body` for private notes).
//
// Reading time: prose words at 230 wpm plus fenced-code words at half weight (code is skimmed, not
// read word by word); mermaid sources are not counted. wordCount counts prose only. Min 1 minute.
import { statSync } from "node:fs";
import { toString as hastToString } from "hast-util-to-string";
import type { Element, Root as HastRoot } from "hast";
import type { Blockquote, Nodes, Paragraph, Root, RootContent } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import { parse as parseYaml } from "yaml";
import type { Heading, PostMeta } from "../types.ts";
import { attachmentHref, resolveAttachment } from "../attachments.ts";
import {
  baseOf,
  dirOf,
  orderFromName,
  stripNoteExt,
  stripOrderPrefix,
  toLogicalPath,
} from "../paths.ts";
import { slugifyPath } from "../slug.ts";
import type { Catalog } from "./catalog.ts";
import { toStringList } from "./catalog.ts";
import { exportConst } from "./estree.ts";
import type { ObsidianData } from "./remark-obsidian.ts";
import type { EsProgram, FileLike } from "./unified-types.ts";

export interface MetaOptions {
  catalog: () => Catalog;
  contentPath: (file: FileLike) => string | null;
  /** vault-relative paths in public/attachments, used to resolve covers (unsynced ones become null) */
  attachments: () => ReadonlySet<string>;
}

interface MetaDraft extends Omit<PostMeta, "headings"> {
  headings: Heading[];
}

const WPM = 230;
/** non-content nodes at the top of a note (frontmatter, injected ESM, link definitions) */
const SKIP_LEAD = new Set(["yaml", "toml", "mdxjsEsm", "definition"]);
const DESCRIPTION_MAX = 180;

export function truncateWords(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  const base = (space > max * 0.6 ? cut.slice(0, space) : clean.slice(0, max)).replace(
    /[\s,;:.!?\-–—]+$/,
    "",
  );
  return `${base}…`;
}

export function toIso(value: unknown): string | null {
  let d: Date;
  if (value instanceof Date) d = value;
  else if (typeof value === "string" || typeof value === "number") d = new Date(value);
  else return null;
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-");
}

function countWords(value: string): number {
  const words = value.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu);
  return words ? words.length : 0;
}

function isCallout(node: RootContent): node is Blockquote {
  return (
    node.type === "blockquote" &&
    typeof (node.data as { hProperties?: { dataCallout?: string } })?.hProperties?.dataCallout ===
      "string"
  );
}

function calloutType(node: Blockquote): string {
  return (node.data as { hProperties: { dataCallout: string } }).hProperties.dataCallout;
}

/** Text of a callout's content div (children[1]). */
function calloutText(node: Blockquote): string {
  const content = node.children[1];
  return content ? mdastToString(content) : "";
}

export function frontmatterOf(tree: Root): Record<string, unknown> {
  const yamlNode = tree.children.find((n) => (n as { type: string }).type === "yaml") as
    | { value?: string }
    | undefined;
  if (!yamlNode?.value) return {};
  try {
    const parsed: unknown = parseYaml(yamlNode.value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Resolves a frontmatter image ref like an embed: absolute URL kept, else "/attachments/…" or null. */
function imageRef(
  value: string,
  label: string,
  attachments: ReadonlySet<string>,
  noteDir: string,
  file: FileLike,
): string | null {
  if (/^https?:\/\//i.test(value) || value.startsWith("//")) return value;
  const { path } = resolveAttachment(value, noteDir, attachments);
  if (!path) {
    file.message(
      `${label} "${value}" not found in public/attachments (run the sync); ${label} set to null`,
    );
    return null;
  }
  return attachmentHref(path);
}

function coverOf(
  fm: Record<string, unknown>,
  attachments: ReadonlySet<string>,
  noteDir: string,
  file: FileLike,
): string | null {
  for (const key of ["cover", "image", "banner"]) {
    const raw = fm[key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    return imageRef(raw.trim(), "cover", attachments, noteDir, file);
  }
  return null;
}

function socialImageOf(
  fm: Record<string, unknown>,
  attachments: ReadonlySet<string>,
  noteDir: string,
  file: FileLike,
): string | null {
  const raw = fm["social-image"];
  if (typeof raw !== "string" || !raw.trim()) return null;
  return imageRef(raw.trim(), "social-image", attachments, noteDir, file);
}

/** Flattens YAML values (an unquoted `[[Name]]` parses as a nested list) into trimmed strings. */
function flatStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(flatStrings);
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  return [];
}

/** `author` / `authors` -> raw names: `[[Name|x]]`, `[[Name#h]]` -> "Name"; trimmed, deduped. */
export function authorNames(fm: Record<string, unknown>): string[] {
  const raw = [...flatStrings(fm.authors), ...flatStrings(fm.author)];
  const out: string[] = [];
  for (const value of raw) {
    let name = value.trim();
    const wiki = /^!?\[\[([\s\S]*?)\]\]$/.exec(name);
    if (wiki) name = wiki[1]!;
    name = name.replace(/\\\|/g, "|").split("|")[0]!.split("#")[0]!.trim();
    if (name && !out.some((n) => n.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

function isTruthy(value: unknown): boolean {
  return value === true || (typeof value === "string" && /^(true|yes|on)$/i.test(value.trim()));
}

function canonicalOf(fm: Record<string, unknown>, file: FileLike): string | null {
  const raw = fm.canonical;
  if (raw == null || raw === "") return null;
  const value = typeof raw === "string" ? raw.trim() : "";
  if (/^https?:\/\/[^\s/]+/i.test(value)) {
    try {
      return new URL(value).href;
    } catch {
      // fall through to the warning
    }
  }
  file.message(`canonical ${JSON.stringify(raw)} is not an absolute http(s) URL; ignored`);
  return null;
}

const SCHEMA_TYPES = ["Article", "BlogPosting", "TechArticle"] as const;
const LEVELS = ["beginner", "intermediate", "advanced"] as const;

function enumOf<T extends string>(
  fm: Record<string, unknown>,
  key: string,
  values: readonly T[],
  file: FileLike,
): T | null {
  const raw = fm[key];
  if (raw == null || raw === "") return null;
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const hit = values.find((v) => v.toLowerCase() === value);
  if (!hit)
    file.message(`${key} ${JSON.stringify(raw)} is not one of ${values.join(", ")}; ignored`);
  return hit ?? null;
}

/** Plain text used by the server-only search index: prose, headings, callouts, tables; no fenced code. */
const INLINE = new Set(["emphasis", "strong", "link", "linkReference", "delete"]);

export function plainText(tree: Root): string {
  const parts: string[] = [];
  const walk = (node: Nodes) => {
    if (
      node.type === "code" ||
      (node as { type: string }).type === "obsidianMermaid" ||
      node.type === "yaml"
    )
      return;
    if (node.type === "footnoteDefinition") return;
    if (
      "value" in node &&
      typeof node.value === "string" &&
      (node.type === "text" || node.type === "inlineCode")
    ) {
      parts.push(node.value);
      return;
    }
    if ("children" in node) {
      const block = !INLINE.has(node.type);
      for (const c of node.children as Nodes[]) walk(c);
      if (block) parts.push("\n");
    }
  };
  walk(tree);
  return parts
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function remarkMeta(options: MetaOptions) {
  return (tree: Root, file: FileLike) => {
    const contentPath = options.contentPath(file);
    const catalog = contentPath !== null ? options.catalog() : null;
    const self = contentPath !== null ? (catalog?.byContentPath.get(contentPath) ?? null) : null;
    const fm = frontmatterOf(tree);
    const obsidian = (file.data.obsidian as ObsidianData | undefined) ?? { links: [], tags: [] };
    const logical =
      self?.logical ??
      (contentPath !== null ? toLogicalPath(contentPath) : baseOf(file.path ?? "note.md"));
    const name = stripNoteExt(baseOf(logical));

    // Title + first-H1 removal
    const firstBlock = tree.children.findIndex((n) => !SKIP_LEAD.has((n as { type: string }).type));
    const h1 = tree.children.find((n) => n.type === "heading" && n.depth === 1);
    const h1Text = h1 ? mdastToString(h1).trim() : null;
    const fmTitle = typeof fm.title === "string" && fm.title.trim() ? fm.title.trim() : null;
    const title = fmTitle ?? h1Text ?? stripOrderPrefix(name);
    if (h1 && h1Text === title && tree.children.indexOf(h1) === firstBlock) {
      tree.children.splice(firstBlock, 1);
    }

    // Description
    let description = typeof fm.description === "string" ? fm.description.trim() : "";
    if (!description) {
      const blocks = tree.children.filter((n) => !SKIP_LEAD.has((n as { type: string }).type));
      const lead = blocks[0];
      if (
        lead &&
        isCallout(lead) &&
        ["summary", "abstract", "tldr", "info", "note"].includes(calloutType(lead))
      ) {
        description = calloutText(lead);
      }
      if (!description) {
        const para = blocks.find(
          (n): n is Paragraph => n.type === "paragraph" && mdastToString(n).trim().length > 0,
        );
        description = para ? mdastToString(para) : "";
      }
      description = truncateWords(description, DESCRIPTION_MAX);
    }

    // Word count
    let prose = 0;
    let code = 0;
    visit(tree, (node) => {
      if (node.type === "code") code += countWords(node.value);
      else if (node.type === "text" || node.type === "inlineCode") prose += countWords(node.value);
    });
    const readingMinutes = Math.max(1, Math.round((prose + code * 0.5) / WPM));

    const fmTags = toStringList(fm.tags ?? fm.tag).flatMap((t) => t.split(/\s+/));
    const tags = [
      ...new Set([...fmTags, ...obsidian.tags].map(normalizeTag).filter(Boolean)),
    ].sort();
    const slug = self?.slug ?? slugifyPath(stripNoteExt(logical));
    const links = [...new Set(obsidian.links)].filter((l) => l !== slug);
    const isPrivate = self?.isPrivate ?? false;
    const markedPrivate =
      (typeof fm.visibility === "string" && fm.visibility.toLowerCase() === "private") ||
      fm.private === true ||
      tags.includes("private");
    if (markedPrivate && !isPrivate && contentPath !== null) {
      throw new Error(
        `${contentPath}: marked private but stored outside content/_private/ (it would ship to the client). Run the vault sync.`,
      );
    }

    let date = toIso(fm.date) ?? toIso(fm.created);
    if (!date) {
      try {
        date = file.path ? statSync(file.path).mtime.toISOString() : null;
      } catch {
        date = null;
      }
    }
    const folderDir = self?.folderDir ?? null;
    const segments = (folderDir ?? logical).split("/");
    const folder = folderDir !== null ? segments[0]! : segments.length > 1 ? segments[0]! : null;

    const meta: MetaDraft = {
      slug,
      title,
      description,
      date: date ?? new Date(0).toISOString(),
      updated: toIso(fm.updated) ?? toIso(fm.modified),
      tags,
      folder,
      order: folderDir !== null ? null : orderFromName(name),
      aliases: toStringList(fm.aliases ?? fm.alias),
      visibility: isPrivate ? "private" : "public",
      isFolderNote: folderDir !== null,
      source: stripNoteExt(logical),
      cover: coverOf(fm, options.attachments(), dirOf(logical), file),
      wordCount: prose,
      readingMinutes,
      headings: [],
      links,
      authors: authorNames(fm),
      socialImage: socialImageOf(fm, options.attachments(), dirOf(logical), file),
      noindex: isTruthy(fm.noindex),
      canonical: canonicalOf(fm, file),
      schemaType: enumOf(fm, "schema", SCHEMA_TYPES, file),
      level: enumOf(fm, "level", LEVELS, file),
    };
    file.data.meta = meta;
    file.data.searchText = plainText(tree);
  };
}

const FOOTNOTE_LABEL = "footnote-label";

export interface RehypeMetaOptions {
  /** compiles the same source to an MDX `function-body` string (private notes only) */
  compileBody?: (file: FileLike) => Promise<string>;
}

/**
 * Collects h2-h4 (ids from rehype-slug) and appends `export const meta`, `export const searchText`
 * (+ `export const body` for private notes) as an ESM node, so MDX handles them for every output
 * format (program and function-body) and md/mdx alike.
 */
export function rehypeMeta(options: RehypeMetaOptions = {}) {
  return async (tree: HastRoot, file: FileLike) => {
    const meta = file.data.meta as MetaDraft | undefined;
    if (!meta) return;
    const headings: Heading[] = [];
    visit(tree, "element", (node: Element) => {
      const m = /^h([2-4])$/.exec(node.tagName);
      if (!m) return;
      const id = node.properties?.id;
      if (typeof id !== "string" || id === FOOTNOTE_LABEL) return;
      headings.push({ depth: Number(m[1]) as 2 | 3 | 4, text: hastToString(node).trim(), id });
    });
    meta.headings = headings;
    const body: EsProgram["body"] = [
      exportConst("meta", meta),
      exportConst("searchText", (file.data.searchText as string | undefined) ?? ""),
    ];
    if (meta.visibility === "private" && options.compileBody) {
      body.push(exportConst("body", await options.compileBody(file)));
    }
    const program: EsProgram = { type: "Program", body, sourceType: "module" };
    tree.children.push({ type: "mdxjsEsm", value: "", data: { estree: program } } as never);
  };
}
