import type { CSSProperties, ElementType, HTMLAttributes } from "react";
import { cn } from "~/lib/cn";

type Tag =
  | "div"
  | "section"
  | "ul"
  | "ol"
  | "li"
  | "article"
  | "header"
  | "nav"
  | "aside"
  | "footer";
type Props = HTMLAttributes<HTMLElement> & { as?: Tag };

/**
 * Staggered entrance container. Children wrapped in <RevealItem index={i}> fade and lift in
 * one after another (CSS `.enter`, see lib/motion.ts `enter` for why it is CSS).
 */
export function Reveal({
  as = "div",
  each = 0.045,
  delay = 0,
  style,
  ...props
}: Props & { each?: number; delay?: number }) {
  const Comp = as as ElementType;
  return (
    <Comp
      style={
        { ...style, "--step": `${each * 1000}ms`, "--delay": `${delay * 1000}ms` } as CSSProperties
      }
      {...props}
    />
  );
}

export function RevealItem({
  as = "div",
  index = 0,
  className,
  style,
  ...props
}: Props & { index?: number }) {
  const Comp = as as ElementType;
  return (
    <Comp
      className={cn("enter", className)}
      style={{ ...style, "--i": index } as CSSProperties}
      {...props}
    />
  );
}
