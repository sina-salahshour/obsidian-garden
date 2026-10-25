import { Link, useRouter } from "@tanstack/react-router";
import { motion } from "motion/react";
import { cn } from "~/lib/cn";
import { ArrowLeft, Reset, SearchIcon } from "./icons";
import { palette } from "~/lib/palette";

/** A small drawn mark: three nodes, one link missing. Used by empty/not-found states. */
function LostGraph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 80"
      className={cn("h-20 w-30 text-accent", className)}
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M22 54 58 22"
        stroke="currentColor"
        strokeOpacity=".35"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M58 22 98 50"
        stroke="currentColor"
        strokeOpacity=".35"
        strokeWidth="1.5"
        strokeDasharray="2 5"
        strokeLinecap="round"
      />
      <circle cx="22" cy="54" r="7" fill="var(--surface)" stroke="currentColor" strokeWidth="1.5" />
      <circle
        cx="58"
        cy="22"
        r="9"
        fill="currentColor"
        fillOpacity=".15"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <motion.circle
        cx="98"
        cy="50"
        r="7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 4"
        animate={{ rotate: 360 }}
        transition={{ duration: 14, ease: "linear", repeat: Infinity }}
        style={{ originX: "98px", originY: "50px" }}
      />
    </svg>
  );
}

export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "enter flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center",
        className,
      )}
    >
      <LostGraph />
      <h2 className="mt-5 font-serif text-2xl font-medium tracking-tight">{title}</h2>
      {children && <div className="mt-2 max-w-sm text-pretty text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

const buttonBase =
  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-[background-color,color,box-shadow,transform] active:scale-[0.98]";
export const buttonStyles = {
  primary: cn(buttonBase, "bg-fg text-bg hover:bg-fg/85"),
  secondary: cn(
    buttonBase,
    "border border-line bg-surface text-fg shadow-[var(--shadow-sm)] hover:border-line-strong",
  ),
  ghost: cn(buttonBase, "text-muted hover:bg-sunken hover:text-fg"),
};

export function NotFound({
  title = "This note drifted off the graph",
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <main id="main" className="container-prose py-20 sm:py-28">
      <p className="text-center font-mono text-xs tracking-widest text-subtle">404</p>
      <EmptyState
        className="mt-4 border-none"
        title={title}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/" className={buttonStyles.primary}>
              <ArrowLeft size={15} /> Home
            </Link>
            <button type="button" className={buttonStyles.secondary} onClick={() => palette.open()}>
              <SearchIcon size={15} /> Search notes
            </button>
          </div>
        }
      >
        {children ??
          "The link may be old, or the note was renamed or unpublished. Try searching for it instead."}
      </EmptyState>
    </main>
  );
}

export function ErrorView({ error, reset }: { error: unknown; reset?: () => void }) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : String(error);
  return (
    <main id="main" className="container-prose py-20 sm:py-28">
      <EmptyState
        className="border-none"
        title="Something went sideways"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className={buttonStyles.primary}
              onClick={() => {
                reset?.();
                void router.invalidate();
              }}
            >
              <Reset size={15} /> Try again
            </button>
            <Link to="/" className={buttonStyles.secondary}>
              Home
            </Link>
          </div>
        }
      >
        <p>The page failed to load. It is probably temporary.</p>
        {import.meta.env.DEV && message && (
          <pre className="mt-4 max-w-full overflow-x-auto rounded-lg bg-sunken p-3 text-left font-mono text-xs text-muted">
            {message}
          </pre>
        )}
      </EmptyState>
    </main>
  );
}
