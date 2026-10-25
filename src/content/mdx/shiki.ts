// Shiki: dual themes through CSS variables (`--shiki-light` / `--shiki-dark`, defaultColor: false),
// `data-language` on every highlighted <pre>. Mermaid figures carry no language class, so Shiki skips them.
import type { RehypeShikiOptions } from "@shikijs/rehype";
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

export const shikiOptions: RehypeShikiOptions = {
  themes: { light: "github-light", dark: "github-dark-dimmed" },
  defaultColor: false,
  langs: [
    "js",
    "jsx",
    "ts",
    "tsx",
    "json",
    "jsonc",
    "bash",
    "shell",
    "css",
    "html",
    "diff",
    "md",
    "yaml",
  ],
  lazy: true,
  fallbackLanguage: "text",
  transformers: [
    {
      name: "data-language",
      pre(node) {
        node.properties["data-language"] = this.options.lang;
      },
    },
  ],
};

/** Plain ``` blocks (no language) become `text` so every code block gets the same Shiki shape. */
export function rehypeCodeDefaults() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, _index, parent) => {
      if (node.tagName !== "pre") return;
      if (parent && parent.type === "element" && parent.tagName === "figure") return; // mermaid
      const code = node.children[0];
      if (!code || code.type !== "element" || code.tagName !== "code") return;
      const cls = code.properties.className;
      const list = Array.isArray(cls) ? cls : [];
      if (!list.some((c) => String(c).startsWith("language-")))
        code.properties.className = [...list, "language-text"];
    });
  };
}
