// Isomorphic slug rules (client + server + build). github-slugger per segment, then runs of "-"
// collapsed ("09 Commit Phase - Mutation" -> "09-commit-phase-mutation", not "09-commit-phase---mutation").
import { slug as githubSlug } from "github-slugger";
import { collectDirs, folderNoteDirFor, stripNoteExt, toLogicalPath } from "./paths.ts";

export function slugifySegment(segment: string): string {
  return githubSlug(segment.trim())
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "react-explain/07 beginWork and Reconciliation" -> "react-explain/07-beginwork-and-reconciliation" */
export function slugifyPath(logicalPathNoExt: string): string {
  return logicalPathNoExt.split("/").filter(Boolean).map(slugifySegment).join("/");
}

/**
 * Slug of a note from its content-relative path (with or without leading "/content/", `_private/`
 * prefix and extension). Folder notes take the slug of their folder: pass `folderDir`.
 */
export function noteSlug(contentPath: string, folderDir?: string | null): string {
  if (folderDir) return slugifyPath(folderDir);
  const rel = toLogicalPath(contentPath.replace(/^\/?content\//, ""));
  return slugifyPath(stripNoteExt(rel));
}

export interface SlugEntry {
  /** the path exactly as given (glob key or content-relative path) */
  key: string;
  /** vault-relative path with extension */
  logical: string;
  slug: string;
  /** the directory this note is the folder note of, else null */
  folderDir: string | null;
}

/**
 * Maps content paths (e.g. glob keys "/content/react-explain/07 x.md" or "_private/a/b.md") to slugs,
 * applying folder-note detection over the whole set.
 */
export function slugEntries(keys: readonly string[]): SlugEntry[] {
  const logical = keys.map((k) => toLogicalPath(k.replace(/^\/?content\//, "")));
  const notes = new Set(logical);
  const dirs = collectDirs(logical);
  return keys.map((key, i) => {
    const path = logical[i]!;
    const folderDir = folderNoteDirFor(path, notes, dirs);
    return { key, logical: path, slug: noteSlug(path, folderDir), folderDir };
  });
}
