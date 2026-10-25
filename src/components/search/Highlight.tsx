import { splitRanges } from "~/lib/highlight";

/** Renders `text` with [start, end) ranges wrapped in <mark>. */
export function Highlight({
  text,
  ranges,
  className,
}: {
  text: string;
  ranges: readonly (readonly [number, number])[];
  className?: string;
}) {
  const parts = splitRanges(text, ranges);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-[3px] bg-mark px-px text-inherit">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}
