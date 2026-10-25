// Structural stand-ins for vfile / estree types (those packages are transitive deps, not resolvable
// directly under pnpm's strict layout). Only what the plugins touch.

export interface FileLike {
  path?: string;
  value: unknown;
  data: Record<string, unknown>;
  message(reason: string): unknown;
}

export type EsNode = { type: string; [key: string]: unknown };

export interface EsProgram {
  type: "Program";
  body: EsNode[];
  sourceType?: string;
}
