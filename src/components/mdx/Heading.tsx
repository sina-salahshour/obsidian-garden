import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "~/lib/cn";
import { copyText } from "~/lib/hooks";
import { spring } from "~/lib/motion";
import { Check, Hash } from "../ui/icons";

type HeadingProps = React.ComponentProps<"h2">;

/** h2/h3 with a hover "#" anchor; clicking it updates the URL and copies the section link. */
function makeHeading(Tag: "h2" | "h3" | "h4") {
  return function Heading({ id, children, className, ...rest }: HeadingProps) {
    const [copied, setCopied] = useState(false);
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
    return (
      <Tag id={id} className={cn("group/h relative", className)} {...rest}>
        {children}
        <a
          href={`#${id}`}
          aria-label="Copy link to this section"
          onClick={async (e) => {
            e.preventDefault();
            history.replaceState(history.state, "", `#${id}`);
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            if (await copyText(location.href)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }
          }}
          className="heading-anchor ml-2 inline-flex size-7 translate-y-[-0.1em] items-center justify-center rounded-md align-middle text-subtle no-underline opacity-0 transition-[opacity,color,background-color] group-hover/h:opacity-100 hover:bg-sunken hover:text-accent focus-visible:opacity-100 max-md:hidden"
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={copied ? "c" : "h"}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={spring.snappy}
            >
              {copied ? <Check size={14} strokeWidth={2.2} /> : <Hash size={14} />}
            </motion.span>
          </AnimatePresence>
        </a>
      </Tag>
    );
  };
}

export const H2 = makeHeading("h2");
export const H3 = makeHeading("h3");
export const H4 = makeHeading("h4");
