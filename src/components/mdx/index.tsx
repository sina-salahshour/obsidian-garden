import type { MDXComponents } from "mdx/types";
import { cn } from "~/lib/cn";
import { Anchor } from "./Anchor";
import { Callout } from "./Callout";
import { CodeBlock } from "./CodeBlock";
import { H2, H3, H4 } from "./Heading";
import { Mermaid } from "./Mermaid";
import { ZoomImage } from "./ZoomImage";

function Aside(props: React.ComponentProps<"aside"> & { "data-callout"?: string }) {
  if (props["data-callout"] !== undefined) return <Callout {...props} />;
  return <aside {...props} />;
}

function Figure(props: React.ComponentProps<"figure"> & { "data-mermaid"?: string }) {
  if (props["data-mermaid"] !== undefined) return <Mermaid {...props} />;
  return <figure {...props} />;
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      className="scrollbar-thin my-7 overflow-x-auto rounded-xl border border-line"
      role="region"
      aria-label="Table"
      tabIndex={0}
    >
      <table className={cn("w-full", className)} {...props} />
    </div>
  );
}

/** Element overrides for compiled notes: `<Content components={mdxComponents} />`. */
export const mdxComponents: MDXComponents = {
  a: Anchor,
  aside: Aside,
  figure: Figure,
  pre: CodeBlock,
  img: ZoomImage,
  table: Table,
  h2: H2,
  h3: H3,
  h4: H4,
};

/** Wrapper for a rendered note body: typography tuned to the design. */
export function ProseBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("prose prose-garden", className)}>{children}</div>;
}
