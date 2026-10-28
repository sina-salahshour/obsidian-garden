// Obsidian-flavoured markdown -> mdast nodes with the hast shapes the UI styles (see README of the
// content contract in the worker brief):
//   [[Note|text]]   -> <a href="/posts/<slug>#id" data-wikilink="">text</a>   (unresolved/private: span.wikilink-unresolved + sr-only " (not published)")
//   ![[img.png|alt|300x200]] -> <img src="/attachments/<vault-relative path>/img.png" alt="alt" width="300" height="200">
//   ![[clip.mp4|label]] -> <video src controls aria-label="label"><a href download>Download label</a></video>
//   ![[Note]]       -> <a href="/posts/<slug>" data-embed="">Title</a>
//   > [!type]± Title-> <aside data-callout data-callout-fold?><div.callout-title><span.callout-title-text/></div><div.callout-content/></aside>
//   ```mermaid      -> <figure data-mermaid="src" class="mermaid"><pre><code>src</code></pre></figure>
//   ==x== -> <mark>, %%c%% removed, #tag -> a.tag, " ^block-id" removed
import { slug as githubSlug } from "github-slugger";
import type {
  Blockquote,
  Code,
  Nodes,
  Parent,
  PhrasingContent,
  Root,
  RootContent,
  Text,
} from "mdast";
import { visit, SKIP } from "unist-util-visit";
import { attachmentHref, resolveAttachment } from "../attachments.ts";
import { baseOf, dirOf, stripNoteExt, toLogicalPath } from "../paths.ts";
import type { Catalog, CatalogEntry } from "./catalog.ts";
import type { FileLike } from "./unified-types.ts";

export interface ObsidianData {
  /** resolved outgoing link slugs (embeds included), in document order, may repeat */
  links: string[];
  /** inline #tags, lowercase without "#" */
  tags: string[];
}

export interface RemarkObsidianOptions {
  /** returns the catalog for wikilink resolution (called once per file) */
  catalog: () => Catalog;
  /** maps a vfile to its content-relative path ("react-explain/07 x.md"), or null when outside content/ */
  contentPath: (file: FileLike) => string | null;
  /** vault-relative attachment paths (the synced public/attachments) */
  attachments: () => ReadonlySet<string>;
}

const IMAGE_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".svg",
  ".ico",
]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".mkv", ".ogv"]);
const FILE_EXT = new Set([".pdf"]);

function ext(name: string): string {
  const b = baseOf(name);
  const i = b.lastIndexOf(".");
  return i <= 0 ? "" : b.slice(i).toLowerCase();
}

/** Fallback URL for an attachment that did not resolve (not synced): its bare file name. */
export function attachmentUrl(name: string): string {
  return `/attachments/${encodeURIComponent(baseOf(name.trim()))}`;
}

/** Canonical Obsidian callout types (aliases -> canonical). */
const CALLOUT_ALIASES: Record<string, string> = {
  note: "note",
  abstract: "summary",
  summary: "summary",
  tldr: "summary",
  info: "info",
  todo: "todo",
  tip: "tip",
  hint: "tip",
  important: "tip",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "failure",
  fail: "failure",
  missing: "failure",
  danger: "danger",
  error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote",
  cite: "quote",
};

export function canonicalCallout(type: string): string {
  const t = type.toLowerCase();
  return CALLOUT_ALIASES[t] ?? t;
}

const SKIP_PARENTS = new Set([
  "link",
  "linkReference",
  "inlineCode",
  "code",
  "html",
  "mdxJsxTextElement",
  "mdxJsxFlowElement",
]);

function text(value: string): Text {
  return { type: "text", value };
}

function el(
  type: "emphasis" | "strong",
  hName: string,
  hProperties: Record<string, unknown>,
  children: PhrasingContent[],
): PhrasingContent {
  return {
    type,
    data: { hName, hProperties, obsidian: true } as never,
    children,
  } as PhrasingContent;
}

/**
 * Hast-only children (`data.hChildren`): rendered on the page but invisible to the mdast text
 * (search index, descriptions), which must not pick up "(not published)" or "Download …".
 */
function withHtmlChildren(node: PhrasingContent, children: unknown[]): PhrasingContent {
  (node.data as Record<string, unknown>).hChildren = children;
  return node;
}

function hText(value: string) {
  return { type: "text", value };
}

function srOnly(value: string) {
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["sr-only"] },
    children: [hText(value)],
  };
}

function unresolved(label: string): PhrasingContent {
  const node = el(
    "emphasis",
    "span",
    { className: ["wikilink-unresolved"], title: "Not published" },
    [text(label)],
  );
  // the dotted underline and tooltip are visual only; say it to screen readers too
  return withHtmlChildren(node, [hText(label), srOnly(" (not published)")]);
}

const SIZE_RE = /^(\d+)(?:x(\d+))?$/;

/** `alt text|300x200` -> { alt, width, height }: a trailing size segment, the rest is the alt text. */
export function parseEmbedAlias(alias: string | null): {
  alt: string;
  width?: string;
  height?: string;
} {
  if (!alias) return { alt: "" };
  const parts = alias.split("|");
  const size = SIZE_RE.exec(parts.at(-1)!.trim());
  if (!size) return { alt: alias.trim() };
  return {
    alt: parts.slice(0, -1).join("|").trim(),
    width: size[1],
    ...(size[2] ? { height: size[2] } : {}),
  };
}

/** "my_clip-v2.mp4" -> "my clip v2": an accessible name for media without an alias. */
function humanName(file: string): string {
  return stripExt(baseOf(file))
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? name : name.slice(0, i);
}

interface Ctx {
  catalog: Catalog | null;
  self: CatalogEntry | null;
  data: ObsidianData;
  attachments: ReadonlySet<string>;
  /** the note's logical (vault-relative) directory, for attachment resolution */
  noteDir: string;
}

function headingId(heading: string): string {
  return githubSlug(heading.trim());
}

/** A link target is reachable from the current note when it is public, or the current note is private too. */
function visible(ctx: Ctx, target: CatalogEntry): boolean {
  return !target.isPrivate || ctx.self?.isPrivate === true;
}

function wikilinkNode(raw: string, embed: boolean, ctx: Ctx): PhrasingContent[] {
  // raw = inside of [[...]]; "\|" (escaped inside tables) is a plain alias separator
  const inner = raw.replace(/\\\|/g, "|");
  const pipe = inner.indexOf("|");
  const targetPart = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
  const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim();
  const hash = targetPart.indexOf("#");
  const target = (hash === -1 ? targetPart : targetPart.slice(0, hash)).trim();
  const subpath = hash === -1 ? null : targetPart.slice(hash + 1).trim();
  const heading = subpath && !subpath.startsWith("^") ? subpath.split("#").pop()!.trim() : null;
  const extension = ext(target);

  // Attachments
  if (target && extension && extension !== ".md" && extension !== ".mdx") {
    const resolved = resolveAttachment(target, ctx.noteDir, ctx.attachments).path;
    const url = resolved ? attachmentHref(resolved) : attachmentUrl(target);
    if (embed && IMAGE_EXT.has(extension)) {
      const { alt, width, height } = parseEmbedAlias(alias);
      const props: Record<string, unknown> = { src: url, alt };
      if (width) props.width = width;
      if (height) props.height = height;
      return [
        {
          type: "image",
          url,
          alt: String(props.alt),
          data: { hProperties: props },
        } as PhrasingContent,
      ];
    }
    if (embed && (AUDIO_EXT.has(extension) || VIDEO_EXT.has(extension))) {
      const label = alias && !SIZE_RE.test(alias) ? alias : humanName(target);
      const tag = AUDIO_EXT.has(extension) ? "audio" : "video";
      const media = el(
        "emphasis",
        tag,
        { src: url, controls: true, preload: "metadata", ariaLabel: label },
        [],
      );
      // the link is the fallback for browsers that cannot play the file
      return [
        withHtmlChildren(media, [
          {
            type: "element",
            tagName: "a",
            properties: { href: url, download: "" },
            children: [hText(`Download ${label}`)],
          },
        ]),
      ];
    }
    if (embed || FILE_EXT.has(extension) || IMAGE_EXT.has(extension)) {
      return [{ type: "link", url, children: [text(alias ?? baseOf(target))] } as PhrasingContent];
    }
  }

  const entry = target ? (ctx.catalog?.resolve(target) ?? null) : ctx.self;
  const display =
    alias ??
    (embed && entry && !heading
      ? entry.title
      : heading
        ? target
          ? `${stripNoteExt(baseOf(target))} > ${heading}`
          : heading
        : stripNoteExt(baseOf(target)));
  if (!entry || !visible(ctx, entry)) return [unresolved(display)];
  if (target && entry !== ctx.self) ctx.data.links.push(entry.slug);
  const url = `${entry.href}${heading ? `#${headingId(heading)}` : ""}`;
  const marker = embed ? { dataEmbed: "" } : { dataWikilink: "" };
  return [
    {
      type: "link",
      url,
      data: { hProperties: marker, obsidian: true },
      children: [text(display)],
    } as PhrasingContent,
  ];
}

const HEX_RE = /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// #tag: preceded by start/whitespace/opening punctuation; letters, digits, _ - / ; must contain a non-digit
const TAG_RE = /(^|[\s([{,;])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
const WIKI_RE = /(!?)\[\[([^[\]\n]+?)\]\]/g;
const MARK_RE = /==(?=\S)([^=\n]*?\S)==/g;
const COMMENT_RE = /%%[\s\S]*?%%/g;
const BLOCK_ID_RE = /(^|[ \t])\^[A-Za-z0-9-]+[ \t]*(?=\n|$)/g;

type Splitter = (value: string, ctx: Ctx) => PhrasingContent[] | null;

function splitBy(
  value: string,
  re: RegExp,
  make: (m: RegExpExecArray) => PhrasingContent[],
): PhrasingContent[] | null {
  re.lastIndex = 0;
  const out: PhrasingContent[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let changed = false;
  while ((m = re.exec(value))) {
    changed = true;
    if (m.index > last) out.push(text(value.slice(last, m.index)));
    out.push(...make(m));
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (!changed) return null;
  if (last < value.length) out.push(text(value.slice(last)));
  return out;
}

const wikiSplitter: Splitter = (value, ctx) =>
  splitBy(value, WIKI_RE, (m) => wikilinkNode(m[2]!, m[1] === "!", ctx));

const markSplitter: Splitter = (value) =>
  splitBy(value, MARK_RE, (m) => [el("emphasis", "mark", {}, [text(m[1]!)])]);

const tagSplitter: Splitter = (value, ctx) =>
  splitBy(value, TAG_RE, (m) => {
    const raw = m[2]!.replace(/[/-]+$/, "");
    const lead = m[1] ? [text(m[1])] : [];
    if (!raw || HEX_RE.test(raw) || /^\d+$/.test(raw)) return [text(m[0])];
    const rest = m[2]!.slice(raw.length);
    const tag = raw.toLowerCase();
    ctx.data.tags.push(tag);
    const link = {
      type: "link",
      url: `/posts?tag=${encodeURIComponent(tag)}`,
      data: { hProperties: { className: ["tag"], dataTag: tag }, obsidian: true },
      children: [text(`#${raw}`)],
    } as PhrasingContent;
    return [...lead, link, ...(rest ? [text(rest)] : [])];
  });

function transformText(parent: Parent, splitter: Splitter, ctx: Ctx, skipTypes: Set<string>): void {
  const walk = (node: Parent) => {
    if (skipTypes.has(node.type)) return;
    if ((node.data as { obsidian?: boolean } | undefined)?.obsidian) return;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i] as Nodes;
      if (child.type === "text") {
        const replaced = splitter(child.value, ctx);
        if (replaced) {
          const kept = replaced.filter((n) => n.type !== "text" || n.value !== "");
          node.children.splice(i, 1, ...(kept as never[]));
          i += kept.length - 1;
        }
      } else if ("children" in child) {
        walk(child as Parent);
      }
    }
  };
  walk(parent);
}

function stripInline(tree: Root): void {
  visit(tree, "text", (node, index, parent) => {
    if (!parent || index === undefined || SKIP_PARENTS.has(parent.type)) return;
    let value = node.value.replace(COMMENT_RE, "");
    if (parent.type === "paragraph" || parent.type === "tableCell")
      value = value.replace(BLOCK_ID_RE, "");
    node.value = value;
  });
}

/** Multi-block `%% ... %%` comments that survived the sync (e.g. hand-written content/ files). */
function stripBlockComments(tree: Root): void {
  const strip = (parent: Parent) => {
    let open = -1;
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i] as RootContent;
      const txt =
        child.type === "paragraph"
          ? child.children.map((c) => ("value" in c ? c.value : "")).join("")
          : "";
      const count = (txt.match(/%%/g) ?? []).length;
      if (
        open === -1 &&
        child.type === "paragraph" &&
        txt.trimStart().startsWith("%%") &&
        count % 2 === 1
      ) {
        open = i;
      } else if (open !== -1 && count % 2 === 1 && txt.trimEnd().endsWith("%%")) {
        parent.children.splice(open, i - open + 1);
        i = open - 1;
        open = -1;
      } else if ("children" in child && open === -1) {
        strip(child as Parent);
      }
    }
  };
  strip(tree);
}

function calloutize(node: Blockquote): void {
  const first = node.children[0];
  if (!first || first.type !== "paragraph") return;
  const head = first.children[0];
  if (!head || head.type !== "text") return;
  const m = /^\[!([\w-]+)\]([-+]?)[ \t]*/.exec(head.value);
  if (!m) return;
  const rawType = m[1]!;
  const type = canonicalCallout(rawType);
  const fold = m[2] === "-" ? "closed" : m[2] === "+" ? "open" : null;

  // Title = rest of the first line (may contain inline markup); body = everything after the first "\n".
  head.value = head.value.slice(m[0].length);
  const titleNodes: PhrasingContent[] = [];
  const restNodes: PhrasingContent[] = [];
  let inTitle = true;
  for (const child of first.children) {
    if (!inTitle) {
      restNodes.push(child);
      continue;
    }
    if (child.type === "break") {
      inTitle = false;
      continue;
    }
    if (child.type === "text" && child.value.includes("\n")) {
      const nl = child.value.indexOf("\n");
      if (nl > 0) titleNodes.push(text(child.value.slice(0, nl)));
      const after = child.value.slice(nl + 1);
      if (after) restNodes.push(text(after));
      inTitle = false;
      continue;
    }
    titleNodes.push(child);
  }
  const titleTrimmed = titleNodes.filter((n) => n.type !== "text" || n.value.trim() !== "");
  const lastTitle = titleTrimmed[titleTrimmed.length - 1];
  if (lastTitle && lastTitle.type === "text") lastTitle.value = lastTitle.value.replace(/\s+$/, "");
  const label = titleTrimmed.length
    ? titleTrimmed
    : [text(rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase())];

  const body: RootContent[] = [];
  if (restNodes.length) body.push({ type: "paragraph", children: restNodes });
  body.push(...node.children.slice(1));

  const props: Record<string, unknown> = { dataCallout: type };
  if (fold) props.dataCalloutFold = fold;
  // not flagged `obsidian`: wikilinks/tags inside the title are still transformed afterwards
  const titleSpan = {
    type: "emphasis",
    data: { hName: "span", hProperties: { className: ["callout-title-text"] } },
    children: label,
  } as PhrasingContent;
  node.data = { ...node.data, hName: "aside", hProperties: props } as never;
  node.children = [
    {
      type: "paragraph",
      data: { hName: "div", hProperties: { className: ["callout-title"] } },
      children: [titleSpan],
    },
    {
      type: "blockquote",
      data: { hName: "div", hProperties: { className: ["callout-content"] } },
      children: body as never,
    },
  ] as never;
}

/**
 * Sequence diagrams end a statement at `;`, so a `;` inside message or note text ("restore
 * priority; listener returns") is a parse error. Escape it as mermaid's `#59;` entity.
 */
export function normalizeMermaid(source: string): string {
  if (!/^\s*sequenceDiagram\b/.test(source)) return source;
  return source
    .split("\n")
    .map((line) => {
      const colon = line.indexOf(":");
      return colon === -1
        ? line
        : line.slice(0, colon + 1) + line.slice(colon + 1).replaceAll(";", "#59;");
    })
    .join("\n");
}

function mermaidNode(node: Code): RootContent {
  const source = node.value;
  return {
    type: "obsidianMermaid",
    data: {
      hName: "figure",
      hProperties: { dataMermaid: normalizeMermaid(source), className: ["mermaid"] },
      hChildren: [
        {
          type: "element",
          tagName: "pre",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "code",
              properties: {},
              children: [{ type: "text", value: source }],
            },
          ],
        },
      ],
    },
  } as unknown as RootContent;
}

export default function remarkObsidian(options: RemarkObsidianOptions) {
  return (tree: Root, file: FileLike) => {
    const contentPath = options.contentPath(file);
    const catalog = contentPath !== null ? options.catalog() : null;
    const self = contentPath !== null ? (catalog?.byContentPath.get(contentPath) ?? null) : null;
    const logical = self?.logical ?? (contentPath !== null ? toLogicalPath(contentPath) : "");
    const ctx: Ctx = {
      catalog,
      self,
      data: { links: [], tags: [] },
      attachments: options.attachments(),
      noteDir: dirOf(logical),
    };
    file.data.obsidian = ctx.data;

    stripBlockComments(tree);
    stripInline(tree);

    visit(tree, "code", (node, index, parent) => {
      if (node.lang?.toLowerCase() === "mermaid" && parent && index !== undefined) {
        parent.children[index] = mermaidNode(node) as never;
        return SKIP;
      }
    });

    // Callouts first (they read the raw "[!type]" text), innermost last is fine: visit is pre-order.
    visit(tree, "blockquote", (node) => {
      calloutize(node);
    });

    transformText(tree, wikiSplitter, ctx, SKIP_PARENTS);
    transformText(tree, markSplitter, ctx, SKIP_PARENTS);
    transformText(tree, tagSplitter, ctx, new Set([...SKIP_PARENTS, "heading"]));
  };
}
