/**
 * `refero_search` — natural-language search over the local catalog mirror.
 *
 * Author: Nate Davidovich (Lorecraft LLC)
 */
import { getScorer } from "../embeddings.js";
import type { ColorScheme, StyleListItem } from "../types.js";
import {
  applyFilters,
  ensureCatalog,
  searchText,
  toShorthand,
  type StaleNotice,
  type StyleShorthand,
} from "./shared.js";

export interface SearchArgs {
  query?: unknown;
  theme?: unknown;
  tags?: unknown;
  limit?: unknown;
}

export interface SearchResult {
  query: string;
  scorer: "openai" | "keyword";
  count: number;
  results: StyleShorthand[];
  /** Set when these results came from an out-of-date local copy. */
  cache?: StaleNotice;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function asString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed;
}

function asTheme(value: unknown): ColorScheme | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === "light" || value === "dark") return value;
  throw new Error(`theme must be "light" or "dark"`);
}

function asTags(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error("tags must be an array of strings");
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") throw new Error("tags must be strings");
    const t = v.trim();
    if (t) out.push(t);
  }
  return out.length > 0 ? out : undefined;
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

export async function handleSearch(args: SearchArgs): Promise<SearchResult> {
  const query = asString(args.query, "query");
  const theme = asTheme(args.theme);
  const tags = asTags(args.tags);
  const limit = asLimit(args.limit);

  const { styles: catalog, stale } = await ensureCatalog();
  const cache = stale ? { cache: stale } : {};

  // Tag filtering would require detail data which we don't have for every
  // item. If the caller asked for tags, we still filter best-effort using
  // any cached detail rows. For the first pass we only honour `theme`.
  const filtered = applyFilters(catalog, { theme }, undefined);
  const candidates: StyleListItem[] =
    tags && tags.length > 0
      ? filtered.filter((s) => {
          // Light heuristic: keep items whose siteName/northStar mentions any
          // requested tag (case-insensitive). Tag-aware filtering across the
          // whole catalog requires bulk detail fetches — out of scope here.
          const hay = `${s.siteName} ${s.northStar}`.toLowerCase();
          return tags.some((t) => hay.includes(t.toLowerCase()));
        })
      : filtered;

  if (candidates.length === 0) {
    const scorerName = (await getScorer()).name;
    return { query, scorer: scorerName, count: 0, results: [], ...cache };
  }

  const scorer = await getScorer();
  const items = candidates.map((s) => ({ id: s.id, text: searchText(s) }));
  const scored = await scorer.score(query, items);

  const byId = new Map(candidates.map((s) => [s.id, s]));
  const ranked = scored
    .filter((r) => byId.has(r.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => {
      const item = byId.get(r.id);
      if (!item) throw new Error(`internal: missing catalog item for ${r.id}`);
      return toShorthand(item, { score: r.score });
    });

  return {
    query,
    scorer: scorer.name,
    count: ranked.length,
    results: ranked,
    ...cache,
  };
}
