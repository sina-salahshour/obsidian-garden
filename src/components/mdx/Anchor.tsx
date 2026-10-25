import { Link } from "@tanstack/react-router";
import { cn } from "~/lib/cn";
import { ArrowUpRight } from "../ui/icons";

type Props = React.ComponentProps<"a"> & {
  "data-wikilink"?: string | boolean;
  "data-footnote-ref"?: boolean;
  "data-footnote-backref"?: boolean;
};

const FILE_EXT = /\.[a-z0-9]{2,5}$/i;

const wikiClass =
  "wikilink font-medium text-fg no-underline decoration-transparent bg-[linear-gradient(var(--accent-line),var(--accent-line))] bg-[length:100%_1px] bg-[position:0_100%] bg-no-repeat transition-[background-size,color,background-color] duration-300 hover:text-accent-strong hover:bg-[length:100%_2px] rounded-[2px]";

/**
 * Body links. Internal routes become client-side <Link>s (preloaded on intent), wikilinks
 * get their own quiet underline, external links open in a new tab with a small ↗.
 */
export function Anchor({ href = "", children, className, ...rest }: Props) {
  const wiki = rest["data-wikilink"] !== undefined;
  const cls = cn(wiki && wikiClass, className);

  // in-page anchors (footnotes, headings)
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    );
  }

  if (href.startsWith("/") && !href.startsWith("//")) {
    const url = new URL(href, "http://local");
    const hash = url.hash ? url.hash.slice(1) : undefined;
    const path = decodeURI(url.pathname).replace(/\/+$/, "") || "/";
    if (!FILE_EXT.test(path)) {
      if (path.startsWith("/posts/")) {
        return (
          <Link
            to="/posts/$"
            params={{ _splat: path.slice("/posts/".length) }}
            hash={hash}
            preload="intent"
            className={cls}
            {...rest}
          >
            {children}
          </Link>
        );
      }
      if (path.startsWith("/series/")) {
        return (
          <Link
            to="/series/$folder"
            params={{ folder: path.slice("/series/".length) }}
            hash={hash}
            preload="intent"
            className={cls}
            {...rest}
          >
            {children}
          </Link>
        );
      }
      if (path === "/posts") {
        const tag = url.searchParams.get("tag") ?? undefined;
        const folder = url.searchParams.get("folder") ?? undefined;
        return (
          <Link to="/posts" search={{ tag, folder }} className={cls} {...rest}>
            {children}
          </Link>
        );
      }
    }
    return (
      <a href={href} className={cls} {...rest}>
        {children}
      </a>
    );
  }

  if (/^(https?:)?\/\//.test(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("external-link", className)}
        {...rest}
      >
        {children}
        <ArrowUpRight
          size={12}
          strokeWidth={2}
          className="ml-0.5 inline-block -translate-y-px align-baseline opacity-60"
          aria-hidden="true"
        />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }

  return (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  );
}
