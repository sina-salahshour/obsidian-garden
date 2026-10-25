import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/cn";
import { useInView } from "~/lib/hooks";
import { renderMermaid } from "~/lib/mermaid";
import { ease, spring } from "~/lib/motion";
import { usePanZoom } from "~/lib/panzoom";
import { useTheme } from "~/lib/theme";
import { AlertTriangle, Close, Expand, Minus, Plus, Reset } from "../ui/icons";
import { Overlay, overlayButton } from "../ui/Overlay";

type Props = React.ComponentProps<"figure"> & { "data-mermaid"?: string };

/** Rough height for the placeholder so the page does not jump when the diagram lands. */
function estimateHeight(source: string): number {
  const lines = source.split("\n").filter((l) => l.trim() && !l.trim().startsWith("%%")).length;
  const horizontal = /^\s*(flowchart|graph)\s+(LR|RL)/m.test(source);
  const h = horizontal ? 140 + lines * 9 : 120 + lines * 26;
  return Math.max(160, Math.min(h, 560));
}

/** Natural width of a rendered diagram, from its viewBox. */
function naturalWidth(svg: string): number | null {
  const m = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) [\d.]+"/.exec(svg);
  return m ? Number(m[1]) : null;
}

/**
 * Client-rendered Mermaid diagram. SSR emits a sized shimmer plus the hidden source; once
 * the figure nears the viewport, mermaid is imported, rendered with the site's tokens and
 * faded in. Re-renders on theme change (keeping the old diagram up until the new is ready).
 */
export function Mermaid({ "data-mermaid": source = "", children, className, ...rest }: Props) {
  const [ref, inView] = useInView<HTMLElement>("400px");
  const { theme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const scroller = useRef<HTMLButtonElement>(null);

  // wide diagrams scroll horizontally: start centred on the diagram, not at its left edge
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth)
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [svg]);

  useEffect(() => {
    if (!inView || !theme || !source) return;
    let cancelled = false;
    renderMermaid(source, theme)
      .then((out) => {
        if (cancelled) return;
        setSvg(out);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [inView, theme, source]);

  const minHeight = estimateHeight(source);

  return (
    <figure
      ref={ref}
      {...rest}
      className={cn(
        "not-prose group/mmd relative my-8 rounded-2xl border border-line bg-surface",
        className,
      )}
      data-mermaid-state={error ? "error" : svg ? "ready" : "pending"}
    >
      {/* no-JS / pre-render fallback: the diagram source (hidden; shown only on error below) */}
      <div hidden>{children}</div>

      {error ? (
        <div className="p-4 sm:p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-muted">
            <AlertTriangle size={16} className="text-[var(--c-warning)]" /> This diagram could not
            be rendered
          </p>
          <pre className="scrollbar-thin mt-3 overflow-x-auto rounded-lg bg-sunken p-3 font-mono text-xs leading-relaxed text-muted">
            {source}
          </pre>
        </div>
      ) : (
        <div className="relative" style={{ minHeight: svg ? undefined : minHeight }}>
          <AnimatePresence initial={false}>
            {!svg && (
              <motion.div
                key="placeholder"
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-3 skeleton rounded-xl"
                role="status"
                aria-label="Rendering diagram"
              />
            )}
          </AnimatePresence>
          {svg && (
            <motion.button
              ref={scroller}
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open diagram fullscreen"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: ease.out }}
              className="scrollbar-thin block w-full cursor-zoom-in overflow-x-auto rounded-2xl p-4 text-left sm:p-6"
            >
              <div
                className="mermaid-svg mx-auto"
                style={{
                  // never shrink below ~80% of natural size: wide diagrams scroll inside the figure instead
                  width: `max(100%, ${Math.round((naturalWidth(svg) ?? 0) * 0.8)}px)`,
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </motion.button>
          )}
        </div>
      )}

      {svg && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Expand diagram"
          className="absolute top-2.5 right-2.5 inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface/90 text-muted opacity-100 shadow-[var(--shadow-sm)] backdrop-blur transition-[opacity,color] hover:text-fg sm:opacity-0 sm:group-hover/mmd:opacity-100 sm:focus-visible:opacity-100"
        >
          <Expand size={15} />
        </button>
      )}

      <Overlay open={open} onClose={() => setOpen(false)} label="Diagram viewer">
        {svg && <DiagramViewer svg={svg} onClose={() => setOpen(false)} />}
      </Overlay>
    </figure>
  );
}

function DiagramViewer({ svg, onClose }: { svg: string; onClose: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const pz = usePanZoom(viewport);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={spring.panel}
      className="pointer-events-auto absolute inset-2 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-lg)] sm:inset-6"
    >
      <div
        ref={viewport}
        {...pz.bind}
        className="relative flex-1 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
      >
        <motion.div
          style={{ x: pz.x, y: pz.y, scale: pz.scale, transformOrigin: "0 0" }}
          className="absolute inset-0 grid place-items-center p-6 sm:p-12"
        >
          <div
            className="mermaid-svg mermaid-viewer w-full max-w-6xl [&_svg]:max-h-[80dvh]"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </motion.div>
      </div>
      <div className="pointer-events-none absolute top-3 right-3 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close diagram"
          className={overlayButton}
        >
          <Close size={18} />
        </button>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-surface/90 p-1 shadow-[var(--shadow-md)] backdrop-blur">
          <ToolButton label="Zoom out" onClick={() => pz.zoomBy(1 / 1.4)}>
            <Minus size={16} />
          </ToolButton>
          <ToolButton label="Reset view" onClick={pz.reset}>
            <Reset size={15} />
          </ToolButton>
          <ToolButton label="Zoom in" onClick={() => pz.zoomBy(1.4)}>
            <Plus size={16} />
          </ToolButton>
        </div>
      </div>
      <p className="pointer-events-none absolute bottom-5 left-5 hidden text-xs text-subtle sm:block">
        Drag to pan · scroll or pinch to zoom · double-click to zoom in
      </p>
    </motion.div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.9 }}
      transition={spring.snappy}
      className="inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-fg"
    >
      {children}
    </motion.button>
  );
}
