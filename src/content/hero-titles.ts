/** Accept the original scalar form and keep distinct, non-empty headings in vault order. */
export function normalizeHeroTitles(value: unknown): string[] | null {
  const titles = (Array.isArray(value) ? value : [value]).flatMap((entry: unknown) =>
    typeof entry === "string" && entry.trim() ? [entry.trim()] : [],
  );
  return titles.length ? [...new Set(titles)] : null;
}
