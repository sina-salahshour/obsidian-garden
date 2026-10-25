import { motion } from "motion/react";
import { useTheme } from "~/lib/theme";
import { spring } from "~/lib/motion";
import { cn } from "~/lib/cn";

const rays = Array.from({ length: 8 }, (_, i) => i * 45);

/**
 * Sun ⇄ moon morph: the sun's core grows into the moon while a masking circle slides
 * in to carve the crescent, and the rays spin away. One SVG, three animated attributes.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const label = theme ? `Switch to ${dark ? "light" : "dark"} theme` : "Toggle theme";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-fg",
        className,
      )}
    >
      <motion.svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        initial={false}
        animate={{ opacity: theme ? 1 : 0, rotate: dark ? 40 : 0 }}
        transition={spring.soft}
      >
        <mask id="theme-toggle-mask">
          <rect width="24" height="24" fill="white" />
          <motion.circle
            r="8"
            fill="black"
            initial={false}
            animate={dark ? { cx: 17, cy: 7 } : { cx: 30, cy: -4 }}
            transition={spring.soft}
          />
        </mask>
        <motion.circle
          cx="12"
          cy="12"
          fill="currentColor"
          mask="url(#theme-toggle-mask)"
          initial={false}
          animate={{ r: dark ? 8.5 : 4.5 }}
          transition={spring.soft}
        />
        <motion.g
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          initial={false}
          animate={{ opacity: dark ? 0 : 1, scale: dark ? 0.4 : 1, rotate: dark ? -45 : 0 }}
          transition={spring.soft}
          style={{ originX: "12px", originY: "12px" }}
        >
          {rays.map((deg) => (
            <line key={deg} x1="12" y1="2.5" x2="12" y2="4.5" transform={`rotate(${deg} 12 12)`} />
          ))}
        </motion.g>
      </motion.svg>
    </button>
  );
}
