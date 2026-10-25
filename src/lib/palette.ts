import { useSyncExternalStore } from "react";

/** Tiny global store for the command palette so any button can open it. */
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const palette = {
  open() {
    if (!open) {
      open = true;
      emit();
    }
  },
  close() {
    if (open) {
      open = false;
      emit();
    }
  },
  toggle() {
    open = !open;
    emit();
  },
};

export function usePaletteOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
    () => false,
  );
}
