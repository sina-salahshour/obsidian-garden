import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/cn";
import { copyText } from "~/lib/hooks";
import { spring } from "~/lib/motion";
import { Check, Hash } from "../ui/icons";

type HeadingProps = React.ComponentProps<"h2">;
type Tag = "h2" | "h3" | "h4" | "h5" | "h6";

/**
 * Headings with a hover "#" anchor; clicking it updates the URL and copies the section link.
 * The heading is named by its text alone (`aria-labelledby`), so the anchor's own name
 * ("Copy link to section: …") never leaks into the outline screen readers list.
 */
function makeHeading(Tag: Tag) {
  return function Heading({ id, children, className, ...rest }: HeadingProps) {
    const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    // GFM's footnotes heading: show it as a quiet label
    if (id === "footnote-label") {
      return (
        <Tag id={id} className="footnotes-title">
          {children}
        </Tag>
      );
    }
    if (!id)
      return (
        <Tag className={className} {...rest}>
          {children}
        </Tag>
      );
    const textId = `${id}--text`;
    const verbId = `${id}--copy`;
    return (
      <Tag id={id} aria-labelledby={textId} className={cn("group/h relative", className)} {...rest}>
        <span id={textId} data-heading-text="">
          {children}
        </span>
        <span id={verbId} hidden>
          Copy link to section:
        </span>
        <a
          href={`#${id}`}
          aria-labelledby={`${verbId} ${textId}`}
          onClick={async (e) => {
            e.preventDefault();
            history.replaceState(history.state, "", `#${id}`);
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            document
              .getElementById(id)
              ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
            setStatus((await copyText(location.href)) ? "copied" : "failed");
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setStatus("idle"), 1400);
          }}
          className="heading-anchor ml-2 inline-flex size-7 translate-y-[-0.1em] items-center justify-center rounded-md align-middle text-subtle no-underline opacity-0 transition-[opacity,color,background-color] group-hover/h:opacity-100 hover:bg-sunken hover:text-accent focus-visible:opacity-100 max-md:hidden"
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={status === "copied" ? "c" : "h"}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={spring.snappy}
            >
              {status === "copied" ? <Check size={14} strokeWidth={2.2} /> : <Hash size={14} />}
            </motion.span>
          </AnimatePresence>
        </a>
        <span role="status" className="sr-only">
          {status === "copied"
            ? "Link copied"
            : status === "failed"
              ? "Could not copy the link"
              : ""}
        </span>
      </Tag>
    );
  };
}

export const H2 = makeHeading("h2");
export const H3 = makeHeading("h3");
export const H4 = makeHeading("h4");
export const H5 = makeHeading("h5");
export const H6 = makeHeading("h6");
