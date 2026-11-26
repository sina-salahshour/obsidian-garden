import { z } from "zod";

const tokens = [
  "bg",
  "surface",
  "sunken",
  "fg",
  "muted",
  "subtle",
  "line",
  "line-strong",
  "accent",
  "accent-strong",
  "accent-fg",
  "warm",
  "warm-text",
] as const;

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-f]{6}$/i);
const colors = z.object(
  Object.fromEntries(tokens.map((token) => [token, hex])) as Record<
    (typeof tokens)[number],
    typeof hex
  >,
);
const paletteSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(1),
    light: colors.optional(),
    dark: colors.optional(),
  })
  .refine((entry) => entry.light || entry.dark, "Define a light or dark variant");

export type ColorPalette = z.infer<typeof paletteSchema>;

/** Validate CSS-facing values and preserve the first occurrence of each stable ID. */
export function parseColorPalettes(raw: unknown): { palettes: ColorPalette[]; warnings: string[] } {
  if (raw == null) return { palettes: [], warnings: [] };
  if (!Array.isArray(raw)) return { palettes: [], warnings: ["expected a list of palettes"] };
  const palettes: ColorPalette[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  for (const [i, entry] of raw.entries()) {
    const result = paletteSchema.safeParse(entry);
    if (!result.success) {
      const issue = result.error.issues[0]!;
      const field = issue.path.length ? ` (${issue.path.join(".")})` : "";
      warnings.push(`entry ${i + 1}${field}: ${issue.message}`);
    } else if (ids.has(result.data.id)) {
      warnings.push(`duplicate palette ID "${result.data.id}"`);
    } else {
      ids.add(result.data.id);
      palettes.push(result.data);
    }
  }
  return { palettes, warnings };
}
