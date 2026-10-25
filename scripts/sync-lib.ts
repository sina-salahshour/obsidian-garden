// Pure helpers for scripts/sync-vault.ts. Node 24 type stripping: erasable TS only, node: builtins + yaml.
import { parse as parseYaml } from "yaml";
import {
  collectDirs,
  dirOf,
  folderNoteDirFor,
  folderNoteOf,
  PRIVATE_DIR,
} from "../src/content/paths.ts";

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
  try {
    const parsed: unknown = parseYaml(yaml);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    data = {};
  }
  return { yaml, data, body: text.slice(m[0].length), eol: m[1] ?? "\n" };
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

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Attachment targets referenced by a note: `![[x.png]]`, `![[x.png|300]]`, `[[doc.pdf]]`, `![](x.png)`. */
export function extractAttachmentRefs(body: string): string[] {
  const text = withoutCode(body);
  const refs = new Set<string>();
  for (const m of text.matchAll(/!?\[\[([^\]\n]+?)\]\]/g)) {
    const target = m[1]!.split("|")[0]!.split("#")[0]!.trim();
    if (target && isAttachmentFile(target)) refs.add(basename(target));
  }
  for (const m of text.matchAll(/!\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+["'(][^)]*)?\)/g)) {
    let target = m[1]!.trim();
    if (target.startsWith("<")) target = target.slice(1, -1);
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) continue;
    target = safeDecode(target.split(/[?#]/)[0]!);
    if (target && isAttachmentFile(target)) refs.add(basename(target));
  }
  return [...refs];
}

/** Attachment referenced from frontmatter cover/image/banner (local only). */
export function frontmatterAttachment(data: Record<string, unknown>): string | null {
  for (const key of ["cover", "image", "banner"]) {
    const value = data[key];
    if (typeof value !== "string" || !value.trim()) continue;
    let target = value.trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) return null;
    const wiki = /^!?\[\[([^\]|#]+)/.exec(target);
    if (wiki) target = wiki[1]!;
    target = safeDecode(target.trim());
    return isAttachmentFile(target) ? basename(target) : null;
  }
  return null;
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

export interface SyncSummary {
  added: string[];
  updated: string[];
  removed: string[];
  skipped: string[];
  private: string[];
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
