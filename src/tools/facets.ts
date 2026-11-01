/**
 * `refero_facets` — what vocabulary does this catalog actually use?
 *
 * The catalog's list projection carries no tag taxonomy, so an agent reaching
 * for `tags` is guessing at words that may appear nowhere. What it does carry is
 * real: colour scheme, font stacks, and named colours. This tool surfaces those
 * as ranked facets so a caller can discover the exact strings worth searching
 * for instead of inventing them.
 *
 * Pairs directly with `refero_search`: the search index already spans fonts and
 * colour names (see `searchText`), so any font or colour returned here can be
 * fed straight back as a query and will match.
 *
 * Pure computation over the cached catalog — no network beyond the refresh
 * `ensureCatalog()` may already perform.
 *
 * Author: Nate Davidovich (Lorecraft LLC)
 */
import type { ColorScheme, StyleListItem } from "../types.js";
import { applyFilters, ensureCatalog, type StaleNotice } from "./shared.js";

export interface FacetsArgs {
  theme?: unknown;
  limit?: unknown;
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface FacetsResult {
  total: number;
  themes: Array<FacetCount>;
  fonts: Array<FacetCount>;
  colors: Array<FacetCount>;
  /** How to turn these facets into a follow-up call. */
  usage: string;
  /** Set when these counts came from an out-of-date local copy. */
  cache?: StaleNotice;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function asTheme(value: unknown): ColorScheme | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === "light" || value === "dark") return value;
  throw new Error(`theme must be "light" or "dark"`);
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

/**
 * Count occurrences and return the top `limit`, ties broken alphabetically so
 * the same catalog always produces the same ordering.
 */
export function rankFacet(values: Iterable<string>, limit: number): FacetCount[] {
  const counts = new Map<string, number>();
  const display = new Map<string, string>();

  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    // Keep the first-seen casing — "Inter" reads better than "inter" when the
    // value is going straight back out as a search query.
    if (!display.has(key)) display.set(key, trimmed);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ value: display.get(key) as string, count }))
    .sort((a, b) => (b.count - a.count) || a.value.localeCompare(b.value))
    .slice(0, limit);
}

/** Pure facet extraction — exported for tests and reuse. */
export function computeFacets(
  styles: StyleListItem[],
  limit: number,
): Omit<FacetsResult, "usage" | "cache"> {
  const fonts: string[] = [];
  const colors: string[] = [];
  const themes: string[] = [];

  for (const s of styles) {
    if (s.colorScheme) themes.push(s.colorScheme);
    for (const f of s.fonts ?? []) fonts.push(f);
    for (const c of s.colors ?? []) if (c?.name) colors.push(c.name);
  }

  return {
    total: styles.length,
    themes: rankFacet(themes, 10),
    fonts: rankFacet(fonts, limit),
    colors: rankFacet(colors, limit),
  };
}

export async function handleFacets(args: FacetsArgs): Promise<FacetsResult> {
  const theme = asTheme(args.theme);
  const limit = asLimit(args.limit);

  const { styles: catalog, stale } = await ensureCatalog();
  const scoped = applyFilters(catalog, { theme }, undefined);

  return {
    ...computeFacets(scoped, limit),
    usage:
      "Feed any font or color value back into refero_search as the query — the search index covers font stacks and color names. Use theme with refero_list to narrow further.",
    ...(stale ? { cache: stale } : {}),
  };
}
