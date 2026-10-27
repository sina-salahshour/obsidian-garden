// Pure helpers for scripts/sync-vault.ts. Node 24 type stripping: erasable TS only, node: builtins,
// yaml and github-slugger (via src/content/slug.ts).
import { parse as parseYaml } from "yaml";
import {
  collectDirs,
  dirOf,
  folderNoteDirFor,
  folderNoteOf,
  PRIVATE_DIR,
  stripNoteExt,
} from "../src/content/paths.ts";
import {
  attachmentHref,
  cleanAttachmentRef,
  resolveAttachment,
} from "../src/content/attachments.ts";
import { slugifySegment } from "../src/content/slug.ts";
import type { SiteAuthor, SiteData } from "../src/content/types.ts";

export { PRIVATE_DIR };

export const NOTE_EXTENSIONS = [".md", ".mdx"];

export const ATTACHMENT_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".svg",
  ".ico",
  ".pdf",
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".flac",
  ".webm",
  ".mp4",
  ".mov",
  ".mkv",
  ".ogv",
]);

/** Directory names that are never published (besides any dot-dir). */
const SKIPPED_DIRS = new Set(["templates", "_templates", "node_modules"]);

export function extname(file: string): string {
  const base = basename(file);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

export function basename(file: string): string {
  const parts = file.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

/** True when a vault-relative directory path (posix separators) must be skipped entirely. */
export function isSkippedDir(relDir: string): boolean {
  return relDir
    .split("/")
    .filter(Boolean)
    .some((seg) => seg.startsWith(".") || SKIPPED_DIRS.has(seg.toLowerCase()));
}

export function isNoteFile(file: string): boolean {
  return NOTE_EXTENSIONS.includes(extname(file));
}

export function isAttachmentFile(file: string): boolean {
  return ATTACHMENT_EXTENSIONS.has(extname(file));
}

export interface SplitNote {
  /** raw YAML between the fences, or null when the note has no frontmatter */
  yaml: string | null;
  /** parsed frontmatter (empty object when absent or invalid) */
  data: Record<string, unknown>;
  /** YAML parse error, when the fence is present but its content is not valid YAML */
  error?: string;
  body: string;
  /** line ending used by the fence */
  eol: string;
}

const FRONTMATTER_RE = /^---(\r?\n)([\s\S]*?)(?:\r?\n)?---[ \t]*(?:\r?\n|$)/;

export function splitFrontmatter(source: string): SplitNote {
  const text = source.startsWith("﻿") ? source.slice(1) : source;
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return { yaml: null, data: {}, body: text, eol: "\n" };
  const yaml = m[2] ?? "";
  let data: Record<string, unknown> = {};
  let error: string | undefined;
  try {
    const parsed: unknown = parseYaml(yaml);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch (e) {
    error = (e instanceof Error ? e.message : String(e)).split("\n")[0];
  }
  return { yaml, data, error, body: text.slice(m[0].length), eol: m[1] ?? "\n" };
}

function truthy(value: unknown): boolean {
  return value === true || (typeof value === "string" && /^(true|yes|on)$/i.test(value.trim()));
}

function falsy(value: unknown): boolean {
  return value === false || (typeof value === "string" && /^(false|no|off)$/i.test(value.trim()));
}

/** A note is published unless frontmatter says `publish: false` or `draft: true`. */
export function shouldPublish(data: Record<string, unknown>): boolean {
  if (falsy(data.publish)) return false;
  if (truthy(data.draft)) return false;
  return true;
}

export function hasDate(data: Record<string, unknown>): boolean {
  return data.date != null || data.created != null;
}

/** Adds `created: <iso>` to the frontmatter of the copy (creating a frontmatter block when absent). */
export function injectCreated(source: string, iso: string): string {
  const { yaml, eol, body } = splitFrontmatter(source);
  if (yaml === null) return `---\ncreated: ${iso}\n---\n\n${body}`;
  const trimmed = yaml.replace(/\s+$/, "");
  const inner = trimmed.length ? `${trimmed}${eol}created: ${iso}` : `created: ${iso}`;
  return `---${eol}${inner}${eol}---${eol}${body}`;
}

/**
 * Removes Obsidian `%%comments%%` (inline and multi-line) outside fenced code and inline code,
 * so private comments never reach content/ (and thus never the search corpus).
 */
export function stripComments(body: string): string {
  if (!body.includes("%%")) return body;
  const lines = body.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let inComment = false;
  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence !== null) {
      out.push(line);
      if (
        fenceMatch &&
        fenceMatch[1]!.startsWith(fence[0]!) &&
        fenceMatch[1]!.length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }
    if (!inComment && fenceMatch) {
      fence = fenceMatch[1]!;
      out.push(line);
      continue;
    }
    // Walk the line, toggling comment state on %% that are not inside inline code.
    const startedInComment = inComment;
    let result = "";
    let i = 0;
    while (i < line.length) {
      if (!inComment && line[i] === "`") {
        const ticks = /^`+/.exec(line.slice(i))![0];
        const close = line.indexOf(ticks, i + ticks.length);
        if (close !== -1) {
          result += line.slice(i, close + ticks.length);
          i = close + ticks.length;
          continue;
        }
      }
      if (line.startsWith("%%", i)) {
        inComment = !inComment;
        i += 2;
        continue;
      }
      if (!inComment) result += line[i];
      i += 1;
    }
    const touched = startedInComment || inComment || line.includes("%%");
    if (!(touched && result.trim() === "")) out.push(result);
  }
  return out.join("\n");
}

/** Strips code (fenced + inline) so references inside code are ignored. */
function withoutCode(body: string): string {
  return body.replace(/^(\s*)(`{3,}|~{3,})[\s\S]*?^\s*\2[`~]*\s*$/gm, "").replace(/`[^`\n]*`/g, "");
}

/**
 * Attachment targets referenced by a note: `![[x.png]]`, `![[x.png|300]]`, `[[doc.pdf]]`, `![](x.png)`.
 * Returned as written (cleaned, not resolved): resolve each with `resolveAttachment`.
 */
export function extractAttachmentRefs(body: string): string[] {
  const text = withoutCode(body);
  const refs = new Set<string>();
  for (const m of text.matchAll(/!?\[\[([^\]\n]+?)\]\]/g)) {
    const target = cleanAttachmentRef(m[1]!);
    if (target && isAttachmentFile(target)) refs.add(target);
  }
  for (const m of text.matchAll(/!\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+["'(][^)]*)?\)/g)) {
    let target = m[1]!.trim();
    if (target.startsWith("<")) target = target.slice(1, -1);
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) continue;
    target = cleanAttachmentRef(target.split(/[?#]/)[0]!);
    if (target && isAttachmentFile(target)) refs.add(target);
  }
  return [...refs];
}

const isExternal = (target: string) =>
  /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//");

function localAttachment(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const target = value.trim();
  if (isExternal(target)) return null;
  const cleaned = cleanAttachmentRef(target);
  return isAttachmentFile(cleaned) ? cleaned : null;
}

/** Attachment referenced from frontmatter cover/image/banner (local only), as written (unresolved). */
export function frontmatterAttachment(data: Record<string, unknown>): string | null {
  for (const key of ["cover", "image", "banner"]) {
    const value = data[key];
    if (typeof value !== "string" || !value.trim()) continue;
    return localAttachment(value);
  }
  return null;
}

/** Every local frontmatter attachment of a published note: the cover (see above) + `social-image`. */
export function frontmatterAttachments(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const ref of [frontmatterAttachment(data), localAttachment(data["social-image"])]) {
    if (ref && !out.includes(ref)) out.push(ref);
  }
  return out;
}

/** Transforms a published vault note into its content/ copy (comments stripped, `created` injected). */
export function prepareNote(source: string, createdIso: string): string {
  const { data } = splitFrontmatter(source);
  let out = source.startsWith("﻿") ? source.slice(1) : source;
  if (out.includes("%%")) {
    const split = splitFrontmatter(out);
    const head = split.yaml === null ? "" : out.slice(0, out.length - split.body.length);
    out = head + stripComments(split.body);
  }
  if (!hasDate(data)) out = injectCreated(out, createdIso);
  return out;
}

function hasTag(data: Record<string, unknown>, body: string, tag: string): boolean {
  const raw = data.tags ?? data.tag;
  const list = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === "string"
      ? raw.split(/[\s,]+/)
      : [];
  if (list.some((t) => t.replace(/^#/, "").trim().toLowerCase() === tag)) return true;
  const re = new RegExp(`(^|\\s)#${tag}(?![\\p{L}\\p{N}_/-])`, "iu");
  return re.test(withoutCode(body));
}

/** Own (non-inherited) privacy of a note: `visibility: private`, `private: true` or tag #private. */
export function isMarkedPrivate(data: Record<string, unknown>, body = ""): boolean {
  if (typeof data.visibility === "string" && data.visibility.trim().toLowerCase() === "private")
    return true;
  if (truthy(data.private)) return true;
  return hasTag(data, body, "private");
}

function isMarkedPublic(data: Record<string, unknown>): boolean {
  return (
    (typeof data.visibility === "string" && data.visibility.trim().toLowerCase() === "public") ||
    falsy(data.private)
  );
}

/** excluded > private > public; a tree's state is sticky for every descendant. */
export type NoteState = "public" | "private" | "excluded";

const RANK: Record<NoteState, number> = { public: 0, private: 1, excluded: 2 };

function maxState(a: NoteState, b: NoteState): NoteState {
  return RANK[a] >= RANK[b] ? a : b;
}

export interface VaultNote {
  /** vault-relative posix path with extension */
  path: string;
  data: Record<string, unknown>;
  body: string;
}

export interface DirMarkers {
  /** dirs ("" = vault root) containing a `.private` marker file */
  private: ReadonlySet<string>;
  /** dirs containing a `.nopublish` marker file */
  nopublish: ReadonlySet<string>;
}

export interface Classification {
  states: Map<string, NoteState>;
  warnings: string[];
}

function ownState(data: Record<string, unknown>, body: string): NoteState {
  if (!shouldPublish(data)) return "excluded";
  if (isMarkedPrivate(data, body)) return "private";
  return "public";
}

/**
 * Decides every note's state. Directory trees cascade: a `.nopublish` / `.private` marker or the
 * folder note's own `publish: false|draft: true` / `visibility: private|private: true` applies to
 * every note and subfolder below. Descendants cannot opt back to public (warned).
 */
export function classifyNotes(notes: readonly VaultNote[], markers: DirMarkers): Classification {
  const byPath = new Map(notes.map((n) => [n.path, n]));
  const paths = new Set(byPath.keys());
  const dirs = collectDirs(paths);
  for (const d of [...markers.private, ...markers.nopublish]) if (d) dirs.add(d);
  const warnings: string[] = [];
  const memo = new Map<string, NoteState>();

  const dirState = (dir: string): NoteState => {
    const cached = memo.get(dir);
    if (cached) return cached;
    let state: NoteState = dir ? dirState(dirOf(dir)) : "public";
    if (markers.nopublish.has(dir)) state = "excluded";
    if (markers.private.has(dir)) state = maxState(state, "private");
    const fnPath = dir ? folderNoteOf(dir, paths) : null;
    const fn = fnPath ? byPath.get(fnPath) : undefined;
    if (fn) state = maxState(state, ownState(fn.data, fn.body));
    memo.set(dir, state);
    return state;
  };

  const states = new Map<string, NoteState>();
  for (const note of notes) {
    const folderDir = folderNoteDirFor(note.path, paths, dirs);
    const inherited = folderDir !== null ? dirState(folderDir) : dirState(dirOf(note.path));
    const state = maxState(inherited, ownState(note.data, note.body));
    if (inherited === "private" && isMarkedPublic(note.data)) {
      warnings.push(`${note.path}: "visibility: public" ignored, it sits in a private tree`);
    }
    states.set(note.path, state);
  }
  return { states, warnings };
}

/** Where a classified note is written inside content/. */
export function contentPathFor(path: string, state: NoteState): string | null {
  if (state === "excluded") return null;
  return state === "private" ? `${PRIVATE_DIR}/${path}` : path;
}

export interface AttachmentPlan {
  /** vault-relative attachment paths to publish at public/attachments/<path> */
  publish: string[];
  /** resolved attachments referenced only by private notes (not published) */
  privateOnly: string[];
  warnings: string[];
}

/**
 * Resolves every attachment ref of the published notes (body embeds + frontmatter cover and
 * social-image) against the
 * vault's attachments. Excluded notes contribute nothing; private-only attachments are not published.
 */
export function planAttachments(
  notes: readonly VaultNote[],
  states: ReadonlyMap<string, NoteState>,
  attachments: ReadonlySet<string>,
  /** already-resolved vault paths that are public regardless of notes (site note images) */
  extraPublic: readonly string[] = [],
): AttachmentPlan {
  const publicRefs = new Set<string>(extraPublic);
  const privateRefs = new Set<string>();
  const warnings: string[] = [];
  for (const note of notes) {
    const state = states.get(note.path) ?? "excluded";
    if (state === "excluded") continue;
    const refs = extractAttachmentRefs(note.body);
    for (const ref of frontmatterAttachments(note.data)) if (!refs.includes(ref)) refs.push(ref);
    for (const ref of refs) {
      const { path, ambiguous } = resolveAttachment(ref, dirOf(note.path), attachments);
      if (!path) {
        warnings.push(`attachment not found in vault: ${ref} (in ${note.path})`);
        continue;
      }
      if (ambiguous.length) {
        warnings.push(
          `${note.path}: attachment "${ref}" is ambiguous, using ${path} (also ${ambiguous.join(", ")})`,
        );
      }
      (state === "private" ? privateRefs : publicRefs).add(path);
    }
  }
  return {
    publish: [...publicRefs].sort(),
    privateOnly: [...privateRefs].filter((p) => !publicRefs.has(p)).sort(),
    warnings,
  };
}

// ---------------------------------------------------------------------------------------------
// Site notes: any note with a `site:` key configures the site (content/site.json) instead of being
// published. They are found before publish classification, so they may live in a `.nopublish` tree.

export const SITE_DEFAULTS = {
  title: "Obsidian Garden",
  description: "Notes, deep dives and explainers, published straight from my Obsidian vault.",
  locale: "en",
} as const;

/** True for a site note (frontmatter has a `site:` key, whatever its value). */
export function isSiteNote(data: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(data, "site");
}

/** Splits site notes off the vault's notes (site notes are never published). */
export function partitionSiteNotes(notes: readonly VaultNote[]): {
  site: VaultNote[];
  notes: VaultNote[];
} {
  const site: VaultNote[] = [];
  const rest: VaultNote[] = [];
  for (const n of notes) (isSiteNote(n.data) ? site : rest).push(n);
  return { site, notes: rest };
}

const str = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
};

/** A YAML list, or a comma-separated string; trimmed, empty dropped, deduped. */
function list(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.flat(Infinity).map((v) => (v == null ? "" : String(v)))
    : typeof value === "string"
      ? value.split(",")
      : [];
  return [...new Set(raw.map((v) => v.trim()).filter(Boolean))];
}

/** Inline markdown -> plain text (links, wikilinks, emphasis, code ticks). */
function plainInline(text: string): string {
  return text
    .replace(/!\[\[[^\]\n]*\]\]/g, "")
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, "")
    .replace(/\[\[([^\]|\n]+?)(?:#[^\]|\n]*)?(?:\|([^\]\n]+))?\]\]/g, (_m, t: string, a?: string) =>
      (a ?? t).trim(),
    )
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/`([^`\n]*)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Body without fenced code blocks (inline code is kept as text). */
function withoutFences(body: string): string {
  return body.replace(/^(\s*)(`{3,}|~{3,})[\s\S]*?^\s*\2[`~]*\s*$/gm, "");
}

/** First `# H1` of a body (outside code), as plain text. */
export function firstHeading(body: string): string | null {
  for (const line of withoutFences(stripComments(body)).split("\n")) {
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) return plainInline(m[1]!) || null;
  }
  return null;
}

/** First prose paragraph of a body (no headings, code, lists, quotes, tables, embeds), plain text. */
export function firstParagraph(body: string): string | null {
  const lines = withoutFences(stripComments(body)).split("\n");
  let para: string[] = [];
  for (const line of [...lines, ""]) {
    const t = line.trim();
    if (!t) {
      if (para.length) {
        const text = plainInline(para.join(" "));
        if (text) return text;
      }
      para = [];
      continue;
    }
    const block = /^(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|\||<|!\[|---|\*\*\*|___)/.test(t);
    if (block) {
      para = [];
      continue;
    }
    para.push(t);
  }
  return null;
}

function httpUrl(value: unknown, label: string, warnings: string[]): string | null {
  const raw = str(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    // warned below
  }
  warnings.push(`${label}: "${raw}" is not an absolute http(s) URL; ignored`);
  return null;
}

/** `@me`, `me`, `https://x.com/me` -> "@me". */
export function normalizeHandle(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;
  const handle = raw
    .replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, "")
    .split(/[/?#]/)[0]!
    .replace(/^@+/, "")
    .trim();
  return handle ? `@${handle}` : null;
}

const BCP47 = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

export interface SiteBuild {
  data: SiteData;
  /** vault-relative attachment paths referenced by site notes (published like public attachments) */
  attachments: string[];
  warnings: string[];
}

/**
 * Builds content/site.json from the site notes. `site: settings` notes merge in vault-path order (a
 * later frontmatter field overrides an earlier one, warned when the values differ); title and
 * description fall back to the first settings note with an H1 / first paragraph, then the defaults.
 * `site: author` notes become authors, the `default: true` one (else the first by path) first.
 * `draft: true` site notes are ignored; unknown roles are warned and ignored.
 */
export function buildSiteData(
  siteNotes: readonly VaultNote[],
  attachments: ReadonlySet<string>,
): SiteBuild {
  const warnings: string[] = [];
  const images = new Set<string>();
  const notes = [...siteNotes]
    .filter((n) => !truthy(n.data.draft))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const image = (note: VaultNote, value: unknown, label: string): string | null => {
    const raw = str(value);
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (isExternal(raw)) {
      warnings.push(`${note.path}: ${label} "${raw}" must be a vault attachment or http(s) URL`);
      return null;
    }
    const { path, ambiguous } = resolveAttachment(raw, dirOf(note.path), attachments);
    if (!path) {
      warnings.push(`attachment not found in vault: ${raw} (in ${note.path})`);
      return null;
    }
    if (ambiguous.length) {
      warnings.push(
        `${note.path}: attachment "${raw}" is ambiguous, using ${path} (also ${ambiguous.join(", ")})`,
      );
    }
    images.add(path);
    return attachmentHref(path);
  };

  type Settings = Omit<SiteData, "authors">;
  const set: Partial<Settings> = {};
  const setBy: Partial<Record<keyof Settings, string>> = {};
  let fallbackTitle: string | null = null;
  let fallbackDescription: string | null = null;
  const authors: { note: VaultNote; author: SiteAuthor; isDefault: boolean }[] = [];

  for (const note of notes) {
    const fm = note.data;
    const role = str(fm.site)?.toLowerCase() ?? null;
    if (role === "settings") {
      const assign = <K extends keyof Settings>(
        key: K,
        fmKey: string,
        value: Settings[K] | null,
      ) => {
        if (value === null) return;
        const prev = setBy[key];
        if (prev !== undefined && JSON.stringify(set[key]) !== JSON.stringify(value)) {
          warnings.push(`site ${fmKey}: ${note.path} overrides the value set in ${prev}`);
        }
        set[key] = value;
        setBy[key] = note.path;
      };
      const has = (k: string) => fm[k] != null && fm[k] !== "";
      assign("title", "title", str(fm.title));
      assign("description", "description", str(fm.description));
      if (has("url")) {
        const url = httpUrl(fm.url, `${note.path}: url`, warnings);
        assign("url", "url", url ? url.replace(/\/+$/, "") : null);
      }
      if (has("locale")) {
        const locale = str(fm.locale);
        if (locale && BCP47.test(locale)) assign("locale", "locale", locale);
        else warnings.push(`${note.path}: locale "${String(fm.locale)}" is not BCP-47; ignored`);
      }
      if (has("image")) {
        const img = image(note, fm.image, "image");
        if (img && /\.svg$/i.test(img.split(/[?#]/)[0]!)) {
          warnings.push(
            `${note.path}: site image ${img} is an SVG; social cards need a raster (png/jpg/webp)`,
          );
        }
        assign("image", "image", img);
      }
      if (has("keywords")) assign("keywords", "keywords", list(fm.keywords));
      if (has("twitter")) assign("twitter", "twitter", normalizeHandle(fm.twitter));
      if (has("block-crawlers"))
        assign("blockCrawlers", "block-crawlers", list(fm["block-crawlers"]));
      fallbackTitle ??= firstHeading(note.body);
      fallbackDescription ??= firstParagraph(note.body);
    } else if (role === "author") {
      const name =
        str(fm.name) ??
        str(fm.title) ??
        firstHeading(note.body) ??
        stripNoteExt(basename(note.path)).trim();
      const id = slugifySegment(name);
      if (!id) {
        warnings.push(`${note.path}: author has no usable name; ignored`);
        continue;
      }
      const dup = authors.find((a) => a.author.id === id);
      if (dup) {
        warnings.push(`${note.path}: author "${name}" duplicates ${dup.note.path}; ignored`);
        continue;
      }
      const sameAs: string[] = [];
      for (const u of list(fm["same-as"])) {
        const url = httpUrl(u, `${note.path}: same-as`, warnings);
        if (url && !sameAs.includes(url)) sameAs.push(url);
      }
      authors.push({
        note,
        isDefault: truthy(fm.default),
        author: {
          id,
          name,
          aliases: list(fm.aliases ?? fm.alias),
          description: str(fm.description) ?? firstParagraph(note.body) ?? "",
          url: httpUrl(fm.url, `${note.path}: url`, warnings),
          image: image(note, fm.image, "image"),
          sameAs,
          twitter: normalizeHandle(fm.twitter),
          jobTitle: str(fm["job-title"]),
        },
      });
    } else {
      warnings.push(
        `${note.path}: unknown site role "${String(fm.site)}" (use settings or author); ignored`,
      );
    }
  }

  const defaults = authors.filter((a) => a.isDefault);
  if (defaults.length > 1) {
    warnings.push(
      `several default authors (${defaults.map((a) => a.note.path).join(", ")}); using ${defaults[0]!.note.path}`,
    );
  }
  const first = defaults[0] ?? authors[0];
  const ordered = first ? [first, ...authors.filter((a) => a !== first)] : [];

  const data: SiteData = {
    title: set.title ?? fallbackTitle ?? SITE_DEFAULTS.title,
    description: set.description ?? fallbackDescription ?? SITE_DEFAULTS.description,
    locale: set.locale ?? SITE_DEFAULTS.locale,
    url: set.url ?? null,
    image: set.image ?? null,
    keywords: set.keywords ?? [],
    twitter: set.twitter ?? null,
    blockCrawlers: set.blockCrawlers ?? [],
    authors: ordered.map((a) => a.author),
  };
  return { data, attachments: [...images].sort(), warnings };
}

/** content/site.json text: pretty, stable key order (SiteData field order), trailing newline. */
export function serializeSiteData(data: SiteData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export interface SyncSummary {
  added: string[];
  updated: string[];
  removed: string[];
  skipped: string[];
  private: string[];
  /** site notes (vault paths) folded into content/site.json instead of being published */
  site: string[];
  attachments: { added: string[]; updated: string[]; removed: string[] };
  warnings: string[];
}

export function emptySummary(): SyncSummary {
  return {
    added: [],
    updated: [],
    removed: [],
    skipped: [],
    private: [],
    site: [],
    attachments: { added: [], updated: [], removed: [] },
    warnings: [],
  };
}

export function formatSummary(s: SyncSummary, dryRun = false): string {
  const a = s.attachments;
  const parts = [
    `${s.added.length} added`,
    `${s.updated.length} updated`,
    `${s.removed.length} removed`,
    `${s.skipped.length} unpublished`,
    `${s.private.length} private`,
    `${s.site.length} site`,
    `attachments ${a.added.length}+ ${a.updated.length}~ ${a.removed.length}-`,
  ];
  const lines = [`${dryRun ? "[dry-run] " : ""}sync: ${parts.join(", ")}`];
  for (const f of s.added) lines.push(`  + ${f}`);
  for (const f of s.updated) lines.push(`  ~ ${f}`);
  for (const f of s.removed) lines.push(`  - ${f}`);
  for (const f of a.added) lines.push(`  + attachments/${f}`);
  for (const f of a.updated) lines.push(`  ~ attachments/${f}`);
  for (const f of a.removed) lines.push(`  - attachments/${f}`);
  for (const w of s.warnings) lines.push(`  ! ${w}`);
  return lines.join("\n");
}
