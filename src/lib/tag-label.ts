/** Display names for tags whose original slugs are used by published links. */
export function tagLabel(tag: string): string {
  switch (tag.toLowerCase()) {
    case "course":
      return "series";
    case "nextjs-course":
      return "nextjs-series";
    default:
      return tag;
  }
}
