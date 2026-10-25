import { useSyncExternalStore } from "react";
import type { FolderInfo } from "~/content/types";
import { getFolders } from "~/content/functions";

/**
 * Session cache for the header's Lessons panel. The folder list is fetched once, lazily, on the
 * first hover/focus/open of the Lessons button (never on every page load) and then kept for the
 * session. `getFolders` already filters by viewer, so this adds no new data path.
 */
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; folders: FolderInfo[] }
  | { status: "error"; error: unknown };

let state: State = { status: "idle" };
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  for (const l of listeners) l();
};

/** Start loading if nothing is cached or the last attempt failed. Safe to call repeatedly. */
export function prefetchLessons(): void {
  if (state.status === "loading" || state.status === "ready") return;
  set({ status: "loading" });
  getFolders().then(
    (folders) => set({ status: "ready", folders }),
    (error: unknown) => set({ status: "error", error }),
  );
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const idle: State = { status: "idle" };

export function useLessons(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => idle,
  );
}
