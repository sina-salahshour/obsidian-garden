// Minimal JSON value -> ESTree expression (for `export const meta = {...}` injected by recma).
import type { EsNode } from "./unified-types.ts";

type Expression = EsNode;

export function valueToEstree(value: unknown): Expression {
  if (value === null || value === undefined) return { type: "Literal", value: null };
  if (typeof value === "string" || typeof value === "boolean") return { type: "Literal", value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { type: "Literal", value: null };
    if (value < 0)
      return {
        type: "UnaryExpression",
        operator: "-",
        prefix: true,
        argument: { type: "Literal", value: -value },
      };
    return { type: "Literal", value };
  }
  if (Array.isArray(value))
    return { type: "ArrayExpression", elements: value.map((v) => valueToEstree(v)) };
  if (typeof value === "object") {
    return {
      type: "ObjectExpression",
      properties: Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => ({
          type: "Property",
          kind: "init",
          method: false,
          shorthand: false,
          computed: false,
          key: { type: "Literal", value: k },
          value: valueToEstree(v),
        })),
    };
  }
  return { type: "Literal", value: null };
}

export function exportConst(name: string, value: unknown): EsNode {
  return {
    type: "ExportNamedDeclaration",
    specifiers: [],
    source: null,
    attributes: [],
    declaration: {
      type: "VariableDeclaration",
      kind: "const",
      declarations: [
        {
          type: "VariableDeclarator",
          id: { type: "Identifier", name },
          init: valueToEstree(value),
        },
      ],
    },
  };
}
