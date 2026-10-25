import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { cn } from "~/lib/cn";
import { spring } from "~/lib/motion";

/** A tag that links to the filtered post list. */
export function TagChip({
  tag,
  count,
  className,
  size = "sm",
}: {
  tag: string;
  count?: number;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <Link
      to="/posts"
      search={{ tag }}
      className={cn(
        "relative z-10 inline-flex items-center gap-1 rounded-full border border-line bg-surface/60 font-medium text-muted transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent-strong",
        size === "sm" ? "h-6 px-2.5 text-xs" : "h-8 px-3 text-sm",
        className,
      )}
    >
      <span className="text-subtle">#</span>
      {tag}
      {count != null && <span className="ml-0.5 tabular-nums text-subtle">{count}</span>}
    </Link>
  );
}

/**
 * Horizontal filter: the active option is marked by a pill that glides between
 * options (shared layoutId). Scrolls on its own on narrow screens.
 */
export function FilterPills<T extends string>({
  options,
  value,
  layoutId,
  renderOption,
  label,
  className,
}: {
  options: { value: T | undefined; label: React.ReactNode; count?: number }[];
  value: T | undefined;
  layoutId: string;
  /** Render a link (or button) for an option; receive its className and content. */
  renderOption: (
    opt: { value: T | undefined },
    props: { className: string; children: React.ReactNode; "aria-current"?: "true" },
  ) => React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0", className)}
    >
      <ul className="flex w-max gap-1.5 py-1 sm:w-auto sm:flex-wrap">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <li key={opt.value ?? "__all"}>
              {renderOption(opt, {
                "aria-current": active ? "true" : undefined,
                className: cn(
                  "relative inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "text-accent-fg" : "text-muted hover:bg-sunken hover:text-fg",
                ),
                children: (
                  <>
                    {active && (
                      <motion.span
                        layoutId={layoutId}
                        transition={spring.layout}
                        className="absolute inset-0 -z-0 rounded-full bg-accent shadow-[var(--shadow-sm)]"
                      />
                    )}
                    <span className="relative">{opt.label}</span>
                    {opt.count != null && (
                      <span
                        className={cn(
                          "relative text-xs tabular-nums",
                          active ? "text-accent-fg/75" : "text-subtle",
                        )}
                      >
                        {opt.count}
                      </span>
                    )}
                  </>
                ),
              })}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
