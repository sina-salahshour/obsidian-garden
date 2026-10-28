// rehype-slug, but slugging only the text a reader sees: screen-reader-only spans (an unresolved
// wikilink's " (not published)") must not end up in heading ids, or `[[Note#Heading]]` links break.
import GithubSlugger from "github-slugger";
import type { Element, Root } from "hast";
import { toString as hastToString } from "hast-util-to-string";
import { visit } from "unist-util-visit";

const isSrOnly = (n: Element["children"][number]) =>
  n.type === "element" &&
  Array.isArray(n.properties?.className) &&
  n.properties.className.includes("sr-only");

/** Text of a hast element without screen-reader-only spans. */
export function visibleText(node: Element): string {
  const strip = (n: Element): Element => ({
    ...n,
    children: n.children
      .filter((c) => !isSrOnly(c))
      .map((c) => (c.type === "element" ? strip(c) : c)),
  });
  return hastToString(strip(node));
}

export default function rehypeSlug() {
  return (tree: Root) => {
    const slugs = new GithubSlugger();
    visit(tree, "element", (node: Element) => {
      if (/^h[1-6]$/.test(node.tagName) && !node.properties.id)
        node.properties.id = slugs.slug(visibleText(node));
    });
  };
}
