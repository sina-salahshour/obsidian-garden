import { motion } from "motion/react";
import { useEffect, useSyncExternalStore } from "react";
import { site } from "~/site.config";
import { fade } from "~/lib/motion";
import { GithubIcon } from "../ui/icons";

/**
 * Header link to the site's GitHub repository (`site.github`), shaped by `site.githubButton`:
 * "hidden" renders nothing, "icon" is a round icon button like its neighbours, "stars" is a
 * Search-style pill with the star count on sm+ (icon only below sm). External links open in a
 * new tab, like prose links (mdx/Anchor), and say so to screen readers.
 */
export function GithubButton() {
  const repo = site.github;
  if (!repo || site.githubButton === "hidden") return null;
  return site.githubButton === "stars" ? <StarsLink repo={repo} /> : <IconLink repo={repo} />;
}

const NEW_TAB = " (opens in a new tab)";
const iconClass =
  "inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-fg";

function IconLink({ repo }: { repo: string }) {
  return (
    <a
      tabIndex={0}
      href={repo}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`GitHub repository${NEW_TAB}`}
      className={iconClass}
    >
      <GithubIcon size={18} />
    </a>
  );
}

function StarsLink({ repo }: { repo: string }) {
  const stars = useStars(repo);
  // A failed (or rate-limited) fetch quietly leaves a plain icon link.
  if (stars.status === "error") return <IconLink repo={repo} />;
  const label =
    stars.status === "ready"
      ? `GitHub repository, ${exactFmt.format(stars.count)} ${stars.count === 1 ? "star" : "stars"}`
      : "GitHub repository";
  return (
    <a
      tabIndex={0}
      href={repo}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label + NEW_TAB}
      className="inline-flex h-10 items-center gap-2 rounded-full text-muted transition-colors hover:text-fg max-sm:w-10 max-sm:justify-center max-sm:hover:bg-sunken sm:h-9 sm:border sm:border-line sm:bg-surface sm:pr-3.5 sm:pl-3 sm:shadow-[var(--shadow-sm)] sm:hover:border-line-strong"
    >
      <GithubIcon size={18} className="sm:size-[15px]" />
      {/* min width ~ "1.2k" so the pill barely moves when the skeleton turns into the count */}
      <span
        className="hidden min-w-[3.5ch] text-sm tabular-nums sm:inline-block"
        aria-hidden="true"
      >
        {stars.status === "ready" ? (
          <motion.span className="inline-block" variants={fade} initial="hidden" animate="show">
            {compactFmt.format(stars.count)}
          </motion.span>
        ) : (
          <span className="inline-block h-2.5 w-[3ch] animate-pulse rounded-full bg-sunken align-middle" />
        )}
      </span>
    </a>
  );
}

const compactFmt = new Intl.NumberFormat(site.locale, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const exactFmt = new Intl.NumberFormat(site.locale);

/*
 * Star count, fetched client-side from the public GitHub API once per session: cached in
 * sessionStorage across reloads, deduped across mounts by the module-level promise, and only
 * started from an effect (the server and the hydration pass both render the loading state).
 * Failures are not persisted, so a later session (or reload) tries again.
 */
type Stars = { status: "loading" } | { status: "ready"; count: number } | { status: "error" };

const loading: Stars = { status: "loading" };
let state: Stars = loading;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
const set = (next: Stars) => {
  state = next;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const cacheKey = (repo: string) => `gh-stars:${repo}`;

function readCache(repo: string): number | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(repo));
    const n = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function writeCache(repo: string, count: number) {
  try {
    sessionStorage.setItem(cacheKey(repo), String(count));
  } catch {
    // Storage blocked or full: the module state still covers this page's lifetime.
  }
}

function loadStars(repo: string): void {
  if (state.status !== "loading" || pending) return;
  const cached = readCache(repo);
  if (cached !== null) return set({ status: "ready", count: cached });
  const api = repo.replace(/^https:\/\/github\.com\//, "https://api.github.com/repos/");
  pending = fetch(api, { headers: { Accept: "application/vnd.github+json" } })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`GitHub ${res.status}`))))
    .then((data: { stargazers_count?: unknown }) => {
      const count = data.stargazers_count;
      if (typeof count !== "number") throw new Error("No stargazers_count");
      writeCache(repo, count);
      set({ status: "ready", count });
    })
    .catch(() => set({ status: "error" }));
}

function useStars(repo: string): Stars {
  useEffect(() => loadStars(repo), [repo]);
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => loading,
  );
}
