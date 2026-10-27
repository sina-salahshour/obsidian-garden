#!/usr/bin/env node
// One-way mirror: Obsidian vault -> content/ (+ public/attachments/). Never writes to the vault.
// Usage: node scripts/sync-vault.ts [--watch] [--dry-run]   (vault: $OBSIDIAN_VAULT ?? ../obsidian)
// Not part of `vp build`: deploys build from the committed content/ and public/attachments/.
import { createHash } from "node:crypto";
import { existsSync, watch } from "node:fs";
import { mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSiteData,
  classifyNotes,
  contentPathFor,
  emptySummary,
  formatSummary,
  isAttachmentFile,
  isNoteFile,
  isSkippedDir,
  partitionSiteNotes,
  planAttachments,
  prepareNote,
  serializeSiteData,
  splitFrontmatter,
  type SyncSummary,
  type VaultNote,
} from "./sync-lib.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vaultDir = resolve(root, process.env.OBSIDIAN_VAULT ?? "../obsidian");
const contentDir = join(root, "content");
const attachmentsDir = join(root, "public", "attachments");
/** site settings + authors from the vault's site notes (content-relative) */
const SITE_JSON = "site.json";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const watchMode = args.has("--watch");

const toPosix = (p: string) => p.split(sep).join("/");

interface VaultScan {
  notes: string[];
  attachments: string[];
  privateMarkers: Set<string>;
  nopublishMarkers: Set<string>;
}

async function scanVault(): Promise<VaultScan> {
  const scan: VaultScan = {
    notes: [],
    attachments: [],
    privateMarkers: new Set(),
    nopublishMarkers: new Set(),
  };
  const walk = async (dir: string) => {
    const rel = toPosix(relative(vaultDir, dir));
    if (rel && isSkippedDir(rel)) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        if (entry.name === ".private") scan.privateMarkers.add(rel);
        else if (entry.name === ".nopublish") scan.nopublishMarkers.add(rel);
        else if (entry.name.startsWith(".")) continue;
        else if (isNoteFile(entry.name)) scan.notes.push(toPosix(relative(vaultDir, abs)));
        else if (isAttachmentFile(entry.name))
          scan.attachments.push(toPosix(relative(vaultDir, abs)));
      }
    }
  };
  await walk(vaultDir);
  scan.notes.sort();
  scan.attachments.sort();
  return scan;
}

async function listFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = async (d: string) => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const abs = join(d, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else out.push(toPosix(relative(dir, abs)));
    }
  };
  await walk(dir);
  return out;
}

async function removeEmptyDirs(dir: string): Promise<void> {
  if (!existsSync(dir)) return;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await removeEmptyDirs(join(dir, entry.name));
  }
  if (dir !== contentDir && dir !== attachmentsDir && (await readdir(dir)).length === 0)
    await rmdir(dir);
}

const hash = (b: Buffer | string) => createHash("sha1").update(b).digest("hex");

async function writeIfChanged(
  abs: string,
  data: Buffer | string,
): Promise<"added" | "updated" | null> {
  let prev: Buffer | null = null;
  try {
    prev = await readFile(abs);
  } catch {
    prev = null;
  }
  if (prev && hash(prev) === hash(data)) return null;
  if (!dryRun) {
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, data);
  }
  return prev ? "updated" : "added";
}

async function createdIso(abs: string): Promise<string> {
  const st = await stat(abs);
  const birth = st.birthtimeMs > 0 ? st.birthtimeMs : st.mtimeMs;
  return new Date(Math.min(birth, st.mtimeMs) || st.mtimeMs).toISOString();
}

export async function sync(): Promise<SyncSummary> {
  const summary = emptySummary();
  if (!existsSync(vaultDir)) throw new Error(`vault not found: ${vaultDir} (set OBSIDIAN_VAULT)`);
  const scan = await scanVault();

  const allNotes: VaultNote[] = [];
  const sources = new Map<string, string>();
  const invalid: string[] = [];
  for (const path of scan.notes) {
    const source = await readFile(join(vaultDir, path), "utf8");
    const { data, body, error } = splitFrontmatter(source);
    if (error) invalid.push(`  ${path}: ${error}`);
    sources.set(path, source);
    allNotes.push({ path, data, body });
  }
  // Invalid YAML crashes the MDX build, and its visibility (which may cascade to a folder) can't be
  // trusted, so stop before writing anything and keep the last good content/.
  if (invalid.length) {
    throw new Error(`invalid frontmatter (quote values that contain ": "):\n${invalid.join("\n")}`);
  }
  // Site notes (`site:` key) configure content/site.json and are never published. They are split off
  // before classification so they are found even inside `.nopublish` trees (e.g. `_site/`).
  const { site: siteNotes, notes } = partitionSiteNotes(allNotes);
  summary.site.push(...siteNotes.map((n) => n.path));
  const siteBuild = buildSiteData(siteNotes, new Set(scan.attachments));
  summary.warnings.push(...siteBuild.warnings);
  const { states, warnings } = classifyNotes(notes, {
    private: scan.privateMarkers,
    nopublish: scan.nopublishMarkers,
  });
  summary.warnings.push(...warnings);

  const expected = new Set<string>([SITE_JSON]);
  const siteChange = await writeIfChanged(
    join(contentDir, SITE_JSON),
    serializeSiteData(siteBuild.data),
  );
  if (siteChange === "added") summary.added.push(SITE_JSON);
  else if (siteChange === "updated") summary.updated.push(SITE_JSON);
  for (const note of notes) {
    const state = states.get(note.path) ?? "excluded";
    const target = contentPathFor(note.path, state);
    if (!target) {
      summary.skipped.push(note.path);
      continue;
    }
    if (state === "private") summary.private.push(note.path);
    expected.add(target);
    const out = prepareNote(sources.get(note.path)!, await createdIso(join(vaultDir, note.path)));
    const change = await writeIfChanged(join(contentDir, target), out);
    if (change === "added") summary.added.push(target);
    else if (change === "updated") summary.updated.push(target);
  }

  for (const file of await listFiles(contentDir)) {
    if (expected.has(file)) continue;
    summary.removed.push(file);
    if (!dryRun) await rm(join(contentDir, file));
  }

  // Attachments keep their vault-relative path; refs resolve like Obsidian (see resolveAttachment).
  const plan = planAttachments(notes, states, new Set(scan.attachments), siteBuild.attachments);
  summary.warnings.push(...plan.warnings);
  const expectedAttachments = new Set(plan.publish);
  for (const path of plan.publish) {
    const change = await writeIfChanged(
      join(attachmentsDir, path),
      await readFile(join(vaultDir, path)),
    );
    if (change) summary.attachments[change].push(path);
  }
  if (plan.privateOnly.length) {
    summary.warnings.push(
      `${plan.privateOnly.length} attachment(s) used only by private notes not published (public/ is world-readable): ${plan.privateOnly.join(", ")}`,
    );
  }
  for (const file of await listFiles(attachmentsDir)) {
    if (expectedAttachments.has(file)) continue;
    summary.attachments.removed.push(file);
    if (!dryRun) await rm(join(attachmentsDir, file));
  }
  if (!dryRun) {
    await removeEmptyDirs(contentDir);
    await removeEmptyDirs(attachmentsDir);
  }
  return summary;
}

async function runOnce(): Promise<void> {
  try {
    console.log(formatSummary(await sync(), dryRun));
  } catch (error) {
    console.error(`sync failed: ${(error as Error).message}`);
    if (!watchMode) process.exitCode = 1;
  }
}

await runOnce();

if (watchMode) {
  console.log(`watching ${vaultDir} ...`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = Promise.resolve();
  watch(vaultDir, { recursive: true }, (_event, file) => {
    if (
      file &&
      toPosix(String(file))
        .split("/")
        .some((s) => s.startsWith(".") && s !== ".private" && s !== ".nopublish")
    )
      return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      running = running.then(runOnce);
    }, 250);
  });
}
