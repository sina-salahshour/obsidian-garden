// Text escaping shared by the XML server routes (sitemap, RSS).

const XML_ENTITIES: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
};

/** Escape a value for an XML text node or attribute. */
export const escapeXml = (value: string) => value.replace(/[<>&'"]/g, (c) => XML_ENTITIES[c]!);
