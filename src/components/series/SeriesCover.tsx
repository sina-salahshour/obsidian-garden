import { cn } from "~/lib/cn";

/**
 * Course cover art on a calm, token-coloured "paper" (sunken surface + faint dot grid).
 *   - `svg` (FolderInfo.coverSvg): sanitised inline SVG drawn with `var(--token, #fallback)`
 *     colours, so it follows the theme toggle instantly. Letterboxed with `meet`, so the motif
 *     reads at any aspect ratio (square card column, 16:9, the wide hero, a small thumbnail).
 *   - otherwise `src` (raster or unknown SVG) as an <img>, contained on the same paper;
 *   - otherwise a generated, on-brand motif from the title.
 * Corners come from `rounded-*` classes in `className`.
 * `ring` (default true) draws a hairline edge; pass false inside a bordered card, where it would
 * sit next to the card's own border and read as a double line.
 * The art box is the largest 8:5 box that fits (container query units), matching the covers'
 * 800×500 viewBox, so it never needs to stretch.
 */
export function SeriesCover({
  src,
  svg = null,
  title,
  className,
  priority = false,
  ring = true,
}: {
  src: string | null;
  /** FolderInfo.coverSvg */
  svg?: string | null;
  title: string;
  className?: string;
  priority?: boolean;
  /** hairline edge; false inside a bordered card */
  ring?: boolean;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-sunken [container-type:size]", className)}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(var(--line-strong)_1px,transparent_1.4px)] bg-[size:22px_22px] bg-center"
      />
      {/* the same grid in accent, revealed around the cursor while the parent card is hovered
          (useCardHover sets --sx/--sy on [data-spot]), so the paper lights up under the light */}
      <div
        aria-hidden="true"
        data-spot
        className="absolute inset-0 bg-[radial-gradient(var(--accent)_1.2px,transparent_1.7px)] bg-[size:22px_22px] bg-center opacity-0 transition-opacity duration-500 [mask-image:radial-gradient(9rem_circle_at_var(--sx,50%)_var(--sy,50%),#000,transparent_70%)] group-hover:opacity-100"
      />
      <div className="absolute inset-0 grid place-items-center">
        <div aria-hidden="true" className="relative aspect-[8/5] w-[min(88cqw,140.8cqh)]">
          {svg ? (
            <div
              className="absolute inset-0 [&>svg]:block"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : src ? (
            <img
              src={src}
              alt=""
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
              className="absolute inset-0 size-full object-contain"
            />
          ) : (
            <GeneratedCover seed={title} />
          )}
        </div>
      </div>
      {ring && (
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-line ring-inset" />
      )}
    </div>
  );
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Deterministic fallback in the covers' visual family (same on server and client): a small tree of
 * rounded nodes on transparent ground, token strokes, one accent node.
 */
function GeneratedCover({ seed }: { seed: string }) {
  let h = hash(seed);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0), (h % 1000) / 1000);
  const rows = [1, 2 + Math.floor(rnd() * 2), 2 + Math.floor(rnd() * 3)];
  const nodes = rows.flatMap((n, r) =>
    Array.from({ length: n }, (_, i) => ({
      r,
      x: 400 + (i - (n - 1) / 2) * 150,
      y: 120 + r * 130,
    })),
  );
  const accent = 1 + Math.floor(rnd() * (nodes.length - 1));
  const parentOf = (i: number) => {
    const n = nodes[i]!;
    const above = nodes.filter((m) => m.r === n.r - 1);
    return above.reduce((a, b) => (Math.abs(b.x - n.x) < Math.abs(a.x - n.x) ? b : a));
  };
  return (
    <svg
      viewBox="0 0 800 500"
      className="absolute inset-0 size-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <g fill="none" stroke="var(--subtle, #8d867b)" strokeWidth="2.5" strokeLinecap="round">
        {nodes.map((n, i) =>
          n.r === 0 ? null : (
            <path
              key={i}
              d={`M${parentOf(i).x} ${parentOf(i).y + 24} C${parentOf(i).x} ${n.y - 50} ${n.x} ${parentOf(i).y + 70} ${n.x} ${n.y - 24}`}
            />
          ),
        )}
      </g>
      {nodes.map((n, i) => (
        <g key={i}>
          <rect
            x={n.x - 52}
            y={n.y - 24}
            width="104"
            height="48"
            rx="14"
            fill="var(--surface, #ffffff)"
            stroke={i === accent ? "var(--accent, #6d4fd1)" : "var(--subtle, #8d867b)"}
            strokeWidth="2.5"
          />
          {i === accent && (
            <rect
              x={n.x - 52}
              y={n.y - 24}
              width="104"
              height="48"
              rx="14"
              fill="var(--accent, #6d4fd1)"
              fillOpacity=".12"
            />
          )}
          <path
            d={`M${n.x - 30} ${n.y}h${36 + Math.round(rnd() * 20)}`}
            stroke={i === accent ? "var(--accent, #6d4fd1)" : "var(--line-strong, #d4cec3)"}
            strokeWidth="6"
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  );
}
