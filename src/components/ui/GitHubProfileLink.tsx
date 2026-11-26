import { motion } from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "~/lib/cn";
import type { GitHubProfile } from "~/lib/github-profile";
import { spring } from "~/lib/motion";
import { site } from "~/site.config";
import { ArrowUpRight } from "./icons";

const count = new Intl.NumberFormat(site.locale);

export function GitHubProfileLink({
  href,
  name,
  profile,
  className,
}: {
  href: string;
  name: string;
  profile: GitHubProfile | null;
  className?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pinned = useRef(false);
  const touch = useRef(false);
  const restoringFocus = useRef(false);
  const [open, setOpen] = useState(false);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    pinned.current = false;
    setOpen(false);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) dismiss();
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [dismiss, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const position = () => {
      const card = panel.current;
      const anchor = trigger.current;
      const container = root.current;
      if (!card || !anchor || !container) return;
      const margin = 16;
      const viewportStart = viewport?.offsetLeft ?? 0;
      const pageWidth = document.documentElement.clientWidth;
      const viewportEnd = Math.min(viewportStart + (viewport?.width ?? pageWidth), pageWidth);
      card.style.maxWidth = `${viewportEnd - viewportStart - margin * 2}px`;
      const { left, width } = anchor.getBoundingClientRect();
      const cardWidth = card.getBoundingClientRect().width;
      const centered = left + (width - cardWidth) / 2;
      const x = Math.max(
        viewportStart + margin,
        Math.min(centered, viewportEnd - margin - cardWidth),
      );
      card.style.left = `${x - container.getBoundingClientRect().left}px`;
    };
    position();
    window.addEventListener("resize", position);
    viewport?.addEventListener("resize", position);
    viewport?.addEventListener("scroll", position);
    return () => {
      window.removeEventListener("resize", position);
      viewport?.removeEventListener("resize", position);
      viewport?.removeEventListener("scroll", position);
    };
  }, [open]);

  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };

  return (
    <div
      ref={root}
      className="relative inline-block max-w-full"
      onPointerEnter={() => clearTimeout(timer.current)}
      onPointerLeave={() => {
        if (pinned.current) return;
        timer.current = setTimeout(() => {
          if (!root.current?.contains(document.activeElement)) dismiss();
        }, 140);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) dismiss();
      }}
      onKeyDown={(event) => {
        if (!open || event.key !== "Escape") return;
        event.stopPropagation();
        if (panel.current?.contains(document.activeElement)) {
          restoringFocus.current = true;
          trigger.current?.focus({ preventScroll: true });
          restoringFocus.current = false;
        }
        dismiss();
      }}
    >
      <a
        ref={trigger}
        href={href}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className={className}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") show();
        }}
        onPointerDown={(event) => {
          touch.current = event.pointerType === "touch";
        }}
        onFocus={(event) => {
          if (!restoringFocus.current && event.currentTarget.matches(":focus-visible")) show();
        }}
        onClick={(event) => {
          if (event.detail === 0 || !touch.current || pinned.current) return;
          event.preventDefault();
          pinned.current = true;
          show();
        }}
      >
        {name}
      </a>
      {open && (
        <motion.div
          ref={panel}
          id={id}
          role="region"
          aria-label="GitHub profile preview"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.snappy}
          className="absolute bottom-full z-30 w-72 pb-2"
        >
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-lg)]">
            {profile ? (
              <>
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    src={profile.avatar}
                    alt=""
                    width={44}
                    height={44}
                    className="size-11 shrink-0 rounded-full border border-line bg-sunken object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">{profile.name || name}</p>
                    <p className="truncate text-xs text-muted">@{profile.login}</p>
                  </div>
                </div>
                {profile.bio && (
                  <p className="text-sm leading-relaxed [overflow-wrap:anywhere] text-muted">
                    {profile.bio}
                  </p>
                )}
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted tabular-nums">
                  <span>
                    <strong className="font-semibold text-fg">
                      {count.format(profile.followers)}
                    </strong>{" "}
                    followers
                  </span>
                  <span>
                    <strong className="font-semibold text-fg">
                      {count.format(profile.repositories)}
                    </strong>{" "}
                    public repos
                  </span>
                </p>
              </>
            ) : (
              <p role="status" className="text-sm text-muted">
                GitHub profile unavailable.
              </p>
            )}
            <a
              href={href}
              className={cn("inline-flex items-center gap-1 text-xs font-medium", className)}
            >
              View on GitHub <ArrowUpRight size={12} />
            </a>
          </div>
        </motion.div>
      )}
    </div>
  );
}
