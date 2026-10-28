/** Accessible name and description for a Mermaid diagram, read from its source. */
export interface MermaidA11y {
  /** `accTitle`, else the frontmatter `title`, else a name from the diagram type */
  title: string;
  /** `accDescr` (single-line or `accDescr { ... }` block), when present */
  description: string | null;
}

const KINDS: [RegExp, string][] = [
  [/^(flowchart|graph)\b/, "Flowchart"],
  [/^sequenceDiagram\b/, "Sequence diagram"],
  [/^classDiagram/, "Class diagram"],
  [/^stateDiagram/, "State diagram"],
  [/^erDiagram\b/, "Entity relationship diagram"],
  [/^journey\b/, "User journey diagram"],
  [/^gantt\b/, "Gantt chart"],
  [/^pie\b/, "Pie chart"],
  [/^quadrantChart\b/, "Quadrant chart"],
  [/^requirementDiagram\b/, "Requirement diagram"],
  [/^gitGraph\b/, "Git graph"],
  [/^mindmap\b/, "Mind map"],
  [/^timeline\b/, "Timeline"],
  [/^(xychart|sankey|block|packet|architecture|kanban|radar|treemap)/, "Diagram"],
];

export function mermaidA11y(source: string): MermaidA11y {
  let body = source;
  let frontTitle: string | null = null;
  const front = /^\s*---\n([\s\S]*?)\n---\s*\n/.exec(body);
  if (front) {
    frontTitle =
      /^title:\s*(.+)$/m
        .exec(front[1]!)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, "") ?? null;
    body = body.slice(front[0].length);
  }
  const accTitle = /^\s*accTitle\s*:\s*(.+)$/m.exec(body)?.[1]?.trim() || null;
  const block = /^\s*accDescr\s*\{([\s\S]*?)\}/m.exec(body);
  const line = /^\s*accDescr\s*:\s*(.+)$/m.exec(body);
  const description =
    (block?.[1]
      ?.split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ") ||
      line?.[1]?.trim()) ??
    null;

  const first =
    body
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("%%")) ?? "";
  const kind = KINDS.find(([re]) => re.test(first))?.[1] ?? "Diagram";
  return { title: accTitle ?? frontTitle ?? kind, description: description || null };
}
