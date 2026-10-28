import { describe, expect, it } from "vite-plus/test";
import { mermaidA11y } from "../mermaid-a11y.ts";

describe("mermaidA11y", () => {
  it("reads accTitle and a single-line accDescr", () => {
    expect(
      mermaidA11y("flowchart LR\n  accTitle: Render phase\n  accDescr: How work flows\n  A --> B"),
    ).toEqual({ title: "Render phase", description: "How work flows" });
  });

  it("reads a block accDescr and the frontmatter title", () => {
    expect(
      mermaidA11y(
        "---\ntitle: Lanes\n---\nflowchart TD\naccDescr {\n  line one\n  line two\n}\nA-->B",
      ),
    ).toEqual({ title: "Lanes", description: "line one line two" });
  });

  it("falls back to the diagram type", () => {
    expect(mermaidA11y("%% comment\nsequenceDiagram\n  A->>B: hi")).toEqual({
      title: "Sequence diagram",
      description: null,
    });
    expect(mermaidA11y("graph TD\nA-->B").title).toBe("Flowchart");
    expect(mermaidA11y("weird").title).toBe("Diagram");
  });
});
