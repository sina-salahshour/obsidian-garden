import { motion } from "motion/react";
import { cn } from "~/lib/cn";
import { spring } from "~/lib/motion";

/** layoutId shared by the cover on "/" and the hero on /series/$folder, so it morphs between them. */
export const coverLayoutId = (slug: string) => `series-cover-${slug}`;

/**
 * Course cover art. Falls back to a generated, on-brand pattern when the folder note has
 * no cover, so every series looks intentional.
 */
export function SeriesCover({
  slug,
  src,
  title,
  className,
  priority = false,
}: {
  slug: string;
  src: string | null;
  title: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <motion.div
      layoutId={coverLayoutId(slug)}
      transition={spring.panel}
      className={cn("relative overflow-hidden bg-[#1e1938]", className)}
    >
      {src ? (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <GeneratedCover seed={title} />
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-black/5 ring-inset dark:ring-white/8" />
    </motion.div>
  );
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic constellation of nodes from the title (same on server and client). */
function GeneratedCover({ seed }: { seed: string }) {
  let h = hash(seed);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0), (h % 1000) / 1000);
  const pts = Array.from({ length: 9 }, () => ({ x: 120 + rnd() * 360, y: 50 + rnd() * 240 }));
  return (
    <svg
      viewBox="0 0 600 340"
      className="absolute inset-0 size-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`g-${hash(seed)}`} cx="65%" cy="45%" r="70%">
          <stop offset="0" stopColor="#8f78ec" stopOpacity=".35" />
          <stop offset="1" stopColor="#8f78ec" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="600" height="340" fill="#1e1938" />
      <rect width="600" height="340" fill={`url(#g-${hash(seed)})`} />
      <g stroke="#a995f0" strokeOpacity=".35" strokeWidth="1.2">
        {pts.slice(1).map((p, i) => (
          <line
            key={i}
            x1={pts[Math.floor(i / 2)]!.x}
            y1={pts[Math.floor(i / 2)]!.y}
            x2={p.x}
            y2={p.y}
          />
        ))}
      </g>
      {pts.map((p, i) => (
        <rect
          key={i}
          x={p.x - 16}
          y={p.y - 10}
          width="32"
          height="20"
          rx="7"
          fill={i === 4 ? "#f3c37a" : i < 4 ? "#8f78ec" : "#2a2350"}
          stroke="#c3b6fa"
          strokeOpacity=".5"
        />
      ))}
    </svg>
  );
}
