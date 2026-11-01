/**
 * `refero_similar` — Refero's own "similar styles" recommendations for a
 * given identifier.
 *
 * Author: Nate Davidovich (Lorecraft LLC)
 */
import { getById } from "../refero.js";
import { resolveStyle } from "../resolver.js";
import {
  OFFICIAL_MCP_HINT,
  ReferoUnavailableError,
  describeFailure,
  ensureCatalog,
  toShorthand,
  type StyleShorthand,
} from "./shared.js";
import { IdentifierNotFoundError } from "./get.js";

export interface SimilarArgs {
  identifier?: unknown;
  limit?: unknown;
}

export interface SimilarResult {
  identifier: string;
  styleId: string;
  count: number;
  results: StyleShorthand[];
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

function asIdentifier(value: unknown): string {
  if (typeof value !== "string") throw new Error("identifier must be a string");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("identifier is required");
  return trimmed;
}

function asLimit(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_LIMIT;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("limit must be a number");
  }
  const n = Math.floor(value);
  if (n < 1) throw new Error("limit must be >= 1");
  return Math.min(n, MAX_LIMIT);
}

export async function handleSimilar(args: SimilarArgs): Promise<SimilarResult> {
  const identifier = asIdentifier(args.identifier);
  const limit = asLimit(args.limit);

  const { styles: catalog } = await ensureCatalog();
  const match = resolveStyle(identifier, catalog);
  if (!match) {
    throw new IdentifierNotFoundError(
      `No style matched identifier ${JSON.stringify(identifier)} for refero_similar. ` +
        `Try refero_search first to find a valid id or site name.`,
    );
  }

  // Always fetch fresh detail — the .similar bucket is computed server-side
  // and isn't stored alongside the cached FullStyle. Refresh is cheap (one
  // request, fully cached afterwards via ensureStyle if needed).
  let detail: Awaited<ReturnType<typeof getById>>;
  try {
    detail = await getById(match.id);
  } catch (err) {
    throw new ReferoUnavailableError(
      `refero_similar needs Refero's live recommendations, which are never cached. ` +
        `${describeFailure(err)}. Try refero_search over the local catalog. ${OFFICIAL_MCP_HINT}`,
    );
  }
  const similar = (detail.similar ?? []).slice(0, limit);

  return {
    identifier,
    styleId: match.id,
    count: similar.length,
    results: similar.map((s) => toShorthand(s)),
  };
}
