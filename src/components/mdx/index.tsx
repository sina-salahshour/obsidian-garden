import type { MDXComponents } from "mdx/types";
import { useEffect, useRef } from "react";
import { cn } from "~/lib/cn";
import { Anchor } from "./Anchor";
import { Callout } from "./Callout";
import { CodeBlock } from "./CodeBlock";
import { H2, H3, H4, H5, H6 } from "./Heading";
import { Mermaid } from "./Mermaid";
import { Table, Th, Thead } from "./Table";
import { isOverflowing } from "./useOverflow";
import { ZoomImage } from "./ZoomImage";

function Aside(props: React.ComponentProps<"aside"> & { "data-callout"?: string }) {
  if (props["data-callout"] !== undefined) return <Callout {...props} />;
  return <aside {...props} />;
}

function Figure(props: React.ComponentProps<"figure"> & { "data-mermaid"?: string }) {
  if (props["data-mermaid"] !== undefined) return <Mermaid {...props} />;
  return <figure {...props} />;
}

/** Element overrides for compiled notes: `<Content components={mdxComponents} />`. */
export const mdxComponents: MDXComponents = {
  a: Anchor,
  aside: Aside,
  figure: Figure,
  pre: CodeBlock,
  img: ZoomImage,
  table: Table,
  thead: Thead,
  th: Th,
  // the page title is the only h1: a body "# Heading" renders one level down
  h1: H2,
  h2: H2,
  h3: H3,
  h4: H4,
  h5: H5,
  h6: H6,
};

/**
 * Display equations (KaTeX's `.katex-display`) scroll sideways when wider than the measure. Those
 * that do become focusable, named regions so the keyboard can scroll them; the rest stay inert.
 * Done here, on the rendered DOM, so KaTeX's hundreds of spans need no component override.
 */
function useScrollableMath(root: React.RefObject<HTMLElement | null>, deps: unknown) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const blocks = [...el.querySelectorAll<HTMLElement>(".katex-display")];
    if (!blocks.length) return;
    const sync = (b: HTMLElement) => {
      if (isOverflowing(b)) {
        b.tabIndex = 0;
        b.setAttribute("role", "region");
        b.setAttribute("aria-label", "Equation");
      } else {
        b.removeAttribute("tabindex");
        b.removeAttribute("role");
        b.removeAttribute("aria-label");
      }
    };
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) sync(e.target as HTMLElement);
    });
    for (const b of blocks) ro.observe(b);
    return () => ro.disconnect();
  }, [root, deps]);
}

/** Wrapper for a rendered note body: typography tuned to the design. */
export function ProseBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollableMath(ref, children);
  return (
    <div ref={ref} className={cn("prose prose-garden", className)}>
      {children}
    </div>
  );
}
