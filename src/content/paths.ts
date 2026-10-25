// Pure path rules shared by the sync script (Node type stripping: erasable TS, no imports) and the
// build-time MDX plugins. Paths are posix, relative to the vault / content root, WITH extension.

/** Private notes live under content/_private/<same vault-relative path>; never matched by the client glob. */
export const PRIVATE_DIR = "_private";

const NOTE_EXT_RE = /\.mdx?$/i;

export function stripNoteExt(path: string): string {
  return path.replace(NOTE_EXT_RE, "");
}

/** content-relative path -> vault-relative ("logical") path, dropping the `_private/` prefix. */
export function toLogicalPath(contentRel: string): string {
  const p = contentRel.replace(/^\/+/, "");
  return p.startsWith(`${PRIVATE_DIR}/`) ? p.slice(PRIVATE_DIR.length + 1) : p;
}

export function isPrivateContentPath(contentRel: string): boolean {
  return contentRel.replace(/^\/+/, "").startsWith(`${PRIVATE_DIR}/`);
}

export function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function baseOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

/** "07 beginWork and Reconciliation" -> 7 */
export function orderFromName(name: string): number | null {
  const m = /^(\d+)(?=[\s._-]|$)/.exec(name);
  return m ? Number(m[1]) : null;
}

/** "07 beginWork and Reconciliation" -> "beginWork and Reconciliation" */
export function stripOrderPrefix(name: string): string {
  const stripped = name.replace(/^\d+(?:[\s._-]+|$)/, "").trim();
  return stripped || name;
}

/**
 * Folder-note detection over a set of note paths (vault-relative, with extension). For a note path,
 * returns the directory it is the folder note of, or null. First match wins per directory:
 *   1. `<dir>/<dir>.md`   2. `<dir>.md` next to `<dir>/`   3. `<dir>/index.md`
 * `dirs` must contain every directory that holds at least one note (see collectDirs).
 */
export function folderNoteDirFor(
  path: string,
  notes: ReadonlySet<string>,
  dirs: ReadonlySet<string>,
): string | null {
  const dir = dirOf(path);
  const name = stripNoteExt(baseOf(path));
  // 1. <dir>/<dir>.md
  if (dir && baseOf(dir) === name && folderNoteOf(dir, notes) === path) return dir;
  // 2. <dir>.md next to <dir>/
  const sibling = dir ? `${dir}/${name}` : name;
  if (dirs.has(sibling) && folderNoteOf(sibling, notes) === path) return sibling;
  // 3. <dir>/index.md
  if (dir && name.toLowerCase() === "index" && folderNoteOf(dir, notes) === path) return dir;
  return null;
}

/** The folder note of `dir` (vault-relative path with extension), or null. */
export function folderNoteOf(dir: string, notes: ReadonlySet<string>): string | null {
  if (!dir) return null;
  const name = baseOf(dir);
  const parent = dirOf(dir);
  const candidates = [`${dir}/${name}`, parent ? `${parent}/${name}` : name, `${dir}/index`];
  for (const c of candidates) {
    for (const ext of [".md", ".mdx"]) {
      if (notes.has(c + ext)) return c + ext;
    }
  }
  return null;
}

/** Every ancestor directory of every note ("a/b/c.md" -> "a", "a/b"). */
export function collectDirs(notes: Iterable<string>): Set<string> {
  const dirs = new Set<string>();
  for (const n of notes) {
    let d = dirOf(n);
    while (d) {
      dirs.add(d);
      d = dirOf(d);
    }
  }
  return dirs;
}
