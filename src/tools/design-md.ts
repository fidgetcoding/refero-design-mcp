/**
 * `refero_design_md` — render a DESIGN.md from a style. Optionally write it
 * into <vault>/05-Projects/<NAME>/DESIGN.md when `save_to_project` is given.
 *
 * Author: Nate Davidovich (Lorecraft LLC)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderDesignMd } from "../design-md.js";
import { resolveProjectDir } from "../path-safety.js";
import { resolveAndFetch } from "./get.js";
import type { StaleNotice } from "./shared.js";

export interface DesignMdArgs {
  identifier?: unknown;
  save_to_project?: unknown;
}

export interface DesignMdResult {
  identifier: string;
  siteName: string;
  styleId: string;
  markdown: string;
  savedTo?: string;
  /** Set when this was rendered from an out-of-date local copy. */
  cache?: StaleNotice;
}

function asIdentifier(value: unknown): string {
  if (typeof value !== "string") throw new Error("identifier must be a string");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("identifier is required");
  return trimmed;
}

function asProjectName(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("save_to_project must be a string");
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export async function handleDesignMd(args: DesignMdArgs): Promise<DesignMdResult> {
  const identifier = asIdentifier(args.identifier);
  const projectName = asProjectName(args.save_to_project);

  const { style: full, stale } = await resolveAndFetch(identifier);
  const markdown = renderDesignMd(full);
  const cache = stale ? { cache: stale } : {};

  if (!projectName) {
    return {
      identifier,
      siteName: full.siteName,
      styleId: full.id,
      markdown,
      ...cache,
    };
  }

  // resolveProjectDir throws PathSafetyError on bad input — let it propagate
  // so the MCP error envelope surfaces a useful message to the caller.
  const targetDir = resolveProjectDir(projectName);
  await mkdir(targetDir, { recursive: true });
  const targetPath = join(targetDir, "DESIGN.md");
  await writeFile(targetPath, markdown, "utf8");

  return {
    identifier,
    siteName: full.siteName,
    styleId: full.id,
    markdown,
    savedTo: targetPath,
    ...cache,
  };
}
