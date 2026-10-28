import { cn } from "~/lib/cn";
import { Lock } from "./icons";

/** Quiet marker for notes only an admin can see. */
export function PrivateBadge({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-warm/30 bg-warm/10 px-2 py-0.5 text-[0.6875rem] font-medium tracking-wide text-warm-text",
        className,
      )}
      title="Private: only visible to you"
    >
      <Lock size={11} strokeWidth={2} />
      {compact ? <span className="sr-only">Private</span> : "Private"}
    </span>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-surface px-1.5 font-sans text-[0.6875rem] font-medium text-muted shadow-[0_1px_0_var(--line)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
