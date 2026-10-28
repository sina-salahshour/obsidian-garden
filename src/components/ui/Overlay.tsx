import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "~/lib/hooks";
import { fade } from "~/lib/motion";
import { cn } from "~/lib/cn";

/**
 * Fullscreen modal layer (portal). Handles the scrim, Escape, scroll lock, focus
 * containment and restoring focus to the opener.
 */
export function Overlay({
  open,
  onClose,
  label,
  children,
  className,
  scrimClassName,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
  scrimClassName?: string;
}) {
  useScrollLock(open);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  // callers pass a fresh `onClose` each render; read it through a ref so the effect below runs only
  // when `open` flips (re-running it would steal focus back to the first control on every render)
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const focusables = () =>
      [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((el) => !el.hasAttribute("disabled"));
    requestAnimationFrame(() => {
      if (!panel.current?.contains(document.activeElement))
        (focusables()[0] ?? panel.current)?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === "Tab") {
        const els = focusables();
        if (!els.length) return;
        const first = els[0]!;
        const last = els.at(-1)!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      (opener.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]" role="presentation">
          <motion.div
            variants={fade}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={onClose}
            className={cn("absolute inset-0 bg-scrim backdrop-blur-sm", scrimClassName)}
          />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className={cn("pointer-events-none absolute inset-0 outline-none", className)}
          >
            {children}
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export const overlayButton =
  "pointer-events-auto inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface/90 text-muted shadow-[var(--shadow-md)] backdrop-blur transition-colors hover:text-fg";
