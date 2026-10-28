import { Link } from "@tanstack/react-router";
import { site } from "~/site.config";
import { Rss } from "../ui/icons";
import { Kbd } from "../ui/Badge";
import { Logo } from "./SiteHeader";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="container-page flex flex-col gap-6 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo className="size-6" />
          <p>
            <span className="font-serif text-base text-fg">{site.title}</span>
            <span aria-hidden="true" className="mx-2 text-subtle">
              ·
            </span>
            Written in Obsidian by {site.author}
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <li>
            <Link to="/posts" className="link-draw hover:text-fg">
              Posts
            </Link>
          </li>
          <li>
            <Link to="/tags" className="link-draw hover:text-fg">
              Tags
            </Link>
          </li>
          <li>
            <Link to="/graph" className="link-draw hover:text-fg">
              Graph
            </Link>
          </li>
          <li>
            <a href="/rss.xml" className="inline-flex items-center gap-1.5 hover:text-fg">
              <Rss size={14} /> <span className="link-draw">RSS</span>
            </a>
          </li>
          <li className="hidden items-center gap-1.5 text-subtle lg:flex">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> to search
          </li>
        </ul>
      </div>
    </footer>
  );
}
