import { Link } from "@tanstack/react-router";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { site } from "~/site.config";
import { cn } from "~/lib/cn";
import { spring } from "~/lib/motion";
import { palette, usePaletteOpen } from "~/lib/palette";
import { GraphIcon, SearchIcon } from "../ui/icons";
import { Kbd } from "../ui/Badge";
import { ThemeToggle } from "./ThemeToggle";

const nav = [
  { to: "/posts", label: "Posts" },
  { to: "/tags", label: "Tags" },
  { to: "/graph", label: "Graph" },
] as const;

/** The site mark: three linked nodes, the accent one "active". */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={cn("size-7", className)} aria-hidden="true" fill="none">
      <rect x="0.75" y="0.75" width="26.5" height="26.5" rx="8" className="fill-fg" />
      <path
        d="M9 18.5 14 9l5 9.5"
        stroke="var(--bg)"
        strokeOpacity=".55"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="14" cy="9" r="2.6" fill="var(--accent)" />
      <circle cx="9" cy="18.5" r="2.2" fill="var(--bg)" />
      <circle cx="19" cy="18.5" r="2.2" fill="var(--bg)" />
    </svg>
  );
}

/**
 * Sticky header. Condenses (hairline + blur) once the page scrolls; on small screens it
 * slides away while scrolling down and returns on the first scroll up.
 */
export function SiteHeader() {
  const { scrollY } = useScroll();
  const [condensed, setCondensed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const paletteOpen = usePaletteOpen();

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setCondensed(y > 8);
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (!mobile || y < 120) return setHidden(false);
    if (Math.abs(y - prev) < 4) return;
    setHidden(y > prev);
  });

  return (
    <motion.header
      className="sticky top-0 z-40"
      initial={false}
      animate={{ y: hidden && !paletteOpen ? "-100%" : "0%" }}
      transition={spring.panel}
      onFocusCapture={() => setHidden(false)}
    >
      <div
        className={cn(
          "border-b transition-[background-color,border-color,backdrop-filter] duration-300",
          condensed
            ? "border-line bg-bg/80 backdrop-blur-xl backdrop-saturate-150 supports-[not(backdrop-filter:blur(1px))]:bg-bg"
            : "border-transparent bg-bg/0",
        )}
      >
        <div className="container-page flex h-[var(--header-h)] items-center gap-2">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:text-bg"
          >
            Skip to content
          </a>
          <Link
            to="/"
            className="group -ml-1 flex min-w-0 items-center gap-2.5 rounded-lg p-1"
            aria-label={`${site.title}, home`}
          >
            <motion.span
              whileHover={{ rotate: -8 }}
              whileTap={{ scale: 0.92 }}
              transition={spring.snappy}
              className="inline-flex"
            >
              <Logo />
            </motion.span>
            <span className="truncate font-serif text-[1.1875rem] font-medium tracking-tight">
              {site.title}
            </span>
          </Link>

          <nav aria-label="Main" className="ml-auto hidden md:block">
            <ul className="flex items-center gap-0.5">
              {nav.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="relative inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium text-muted transition-colors hover:text-fg data-[status=active]:text-fg"
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="nav-active"
                            transition={spring.layout}
                            className="absolute inset-0 rounded-full bg-sunken"
                          />
                        )}
                        <span className="relative">{item.label}</span>
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-1 md:ml-2">
            <button
              type="button"
              onClick={() => palette.open()}
              aria-label="Search notes"
              aria-keyshortcuts="Meta+K Control+K /"
              className="group inline-flex h-10 items-center gap-2 rounded-full text-muted transition-colors hover:text-fg max-sm:w-10 max-sm:justify-center max-sm:hover:bg-sunken sm:h-9 sm:border sm:border-line sm:bg-surface sm:pr-1.5 sm:pl-3 sm:shadow-[var(--shadow-sm)] sm:hover:border-line-strong"
            >
              <SearchIcon size={16} className="sm:size-[15px]" />
              <span className="hidden text-sm sm:inline">Search</span>
              <Kbd className="ml-3 hidden sm:inline-flex">⌘K</Kbd>
            </button>
            <Link
              to="/graph"
              aria-label="Graph view"
              className="inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-fg md:hidden"
            >
              <GraphIcon size={18} />
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <MobileNav />
      </div>
    </motion.header>
  );
}

/** Second row on phones: the three sections as a calm segmented strip. */
function MobileNav() {
  return (
    <nav aria-label="Sections" className="container-page -mt-1 pb-2 md:hidden">
      <ul className="flex gap-1">
        {nav
          .filter((n) => n.to !== "/graph")
          .map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="relative inline-flex h-8 items-center rounded-full px-3 text-sm font-medium text-muted data-[status=active]:text-fg"
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="mnav-active"
                        transition={spring.layout}
                        className="absolute inset-0 rounded-full bg-sunken"
                      />
                    )}
                    <span className="relative">{item.label}</span>
                  </>
                )}
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  );
}
