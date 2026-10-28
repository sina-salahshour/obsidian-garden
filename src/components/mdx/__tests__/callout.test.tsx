import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { Callout } from "../Callout.tsx";

const markup = (type: string, title: string, fold?: string) =>
  renderToStaticMarkup(
    h(
      Callout,
      { "data-callout": type, "data-callout-fold": fold },
      h(
        "div",
        { className: "callout-title" },
        h("span", { className: "callout-title-text" }, title),
      ),
      h("div", { className: "callout-content" }, h("p", null, "Body text")),
    ),
  );

describe("Callout", () => {
  it("is a note named by its title, with the type spoken when a custom title hides it", () => {
    const html = markup("warning", "Mind the gap");
    expect(html).toMatch(/^<div role="note" aria-labelledby="([^"]+)"/);
    expect(html).toContain('<span class="sr-only">Warning: </span>Mind the gap');
    expect(markup("warning", "Warning")).not.toContain("sr-only");
  });

  it("keeps a closed body mounted and hidden, so aria-controls resolves", () => {
    const html = markup("tip", "More", "closed");
    const controls = /aria-controls="([^"]+)"/.exec(html)?.[1];
    expect(controls).toBeTruthy();
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(new RegExp(`id="${controls}" hidden=""`));
    expect(html).toContain("Body text");
  });
});
