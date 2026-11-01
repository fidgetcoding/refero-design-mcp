/**
 * `refero_get` — resolve an identifier and return the full style detail
 * (with a stable shorthand projection).
 *
 * Author: Nate Davidovich (Lorecraft LLC)
 */
import { resolveStyle } from "../resolver.js";
import {
  ensureCatalog,
  ensureStyle,
  toFullStyleShorthand,
  type FullStyleShorthand,
  type StaleNotice,
  type StyleLoad,
} from "./shared.js";

export interface GetArgs {
  identifier?: unknown;
}

export class IdentifierNotFoundError extends Error {
  public override readonly name = "IdentifierNotFoundError";
}

function asIdentifier(value: unknown): string {
  if (typeof value !== "string") throw new Error("identifier must be a string");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("identifier is required");
  return trimmed;
}

/** Internal helper used by other tools so they don't repeat the resolution. */
export async function resolveAndFetch(identifier: string): Promise<StyleLoad> {
  const { styles: catalog, stale: staleCatalog } = await ensureCatalog();
  const match = resolveStyle(identifier, catalog);
  if (!match) {
    throw new IdentifierNotFoundError(
      `No style matched identifier ${JSON.stringify(identifier)}. ` +
        `Tried: uuid match, hostname match, exact site name, fuzzy site name (Levenshtein <= 2). ` +
        `Run refero_search or refero_refresh to update the local catalog.`,
    );
  }
  const { style, stale: staleStyle } = await ensureStyle(match.id);
  const stale = staleStyle ?? staleCatalog;
  return stale ? { style, stale } : { style };
}

export async function handleGet(
  args: GetArgs,
): Promise<FullStyleShorthand & { cache?: StaleNotice }> {
  const identifier = asIdentifier(args.identifier);
  const { style, stale } = await resolveAndFetch(identifier);
  return { ...toFullStyleShorthand(style), ...(stale ? { cache: stale } : {}) };
}
