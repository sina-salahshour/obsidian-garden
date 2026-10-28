import { createContext, use, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/cn";
import { scrollRegion, useOverflow } from "./useOverflow";

/** Name for a table's scroll region: its caption, else the section it sits in, else "Table N". */
function tableLabel(wrapper: HTMLElement): string {
  const caption = wrapper.querySelector("caption")?.textContent?.trim();
  if (caption) return caption;
  for (let n = wrapper.previousElementSibling; n; n = n.previousElementSibling) {
    if (/^H[1-6]$/.test(n.tagName)) {
      const text = (n.querySelector("[data-heading-text]") ?? n).textContent?.trim();
      if (text) return `Table: ${text}`;
      break;
    }
  }
  const all = [...(wrapper.closest(".prose")?.querySelectorAll("table") ?? [])];
  const i = all.indexOf(wrapper.querySelector("table")!);
  return i >= 0 ? `Table ${i + 1}` : "Table";
}

/** Tables scroll inside their own box; only a box that actually scrolls is focusable and named. */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  const ref = useRef<HTMLDivElement>(null);
  const overflowing = useOverflow(ref);
  const [label, setLabel] = useState("Table");
  useEffect(() => {
    if (overflowing && ref.current) setLabel(tableLabel(ref.current));
  }, [overflowing]);
  return (
    <div
      ref={ref}
      className="scrollbar-thin my-7 overflow-x-auto rounded-xl border border-line"
      {...scrollRegion(overflowing, label)}
    >
      <table className={cn("w-full", className)} {...props} />
    </div>
  );
}

const InHead = createContext(false);

export function Thead(props: React.ComponentProps<"thead">) {
  return (
    <InHead value={true}>
      <thead {...props} />
    </InHead>
  );
}

/** Header cells in the table head are column headers. */
export function Th(props: React.ComponentProps<"th">) {
  const inHead = use(InHead);
  return <th scope={inHead ? "col" : undefined} {...props} />;
}
