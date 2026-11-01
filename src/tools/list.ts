/**
 * `refero_list` — paginated browse over the local catalog mirror with
 * optional theme/tag filters. No scoring.
 *
 * Author: Nate Davidovich (Lorecraft LLC)
 */
import type { ColorScheme } from "../types.js";
import {
  applyFilters,
  ensureCatalog,
  toShorthand,
  type StaleNotice,
  type StyleShorthand,
} from "./shared.js";

export interface ListArgs {
  theme?: unknown;
  tags?: unknown;
  page?: unknown;
  limit?: unknown;
}

export interface ListResult {
  page: number;
  totalPages: number;
  count: number;
  total: number;
  styles: StyleShorthand[];
  /** Set when these results came from an out-of-date local copy. */
  cache?: StaleNotice;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

function asPage(value: unknown): number {
  if (value === undefined || value === null) return 1;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("page must be a number");
  }
  const n = Math.floor(value);
  if (n < 1) throw new Error("page must be >= 1");
  return n;
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

export async function handleList(args: ListArgs): Promise<ListResult> {
  const theme = asTheme(args.theme);
  const tags = asTags(args.tags);
  const page = asPage(args.page);
  const limit = asLimit(args.limit);

  const { styles: catalog, stale } = await ensureCatalog();
  const filtered = applyFilters(catalog, { theme }, undefined);

  const candidates =
    tags && tags.length > 0
      ? filtered.filter((s) => {
          // Same heuristic as refero_search: list-only catalog has no tag
          // bucket, so we look at name + northStar.
          const hay = `${s.siteName} ${s.northStar}`.toLowerCase();
          return tags.some((t) => hay.includes(t.toLowerCase()));
        })
      : filtered;

  // Stable order: createdAt desc, then siteName asc.
  candidates.sort((a, b) => {
    const ad = a.createdAt ?? "";
    const bd = b.createdAt ?? "";
    if (ad !== bd) return bd.localeCompare(ad);
    return a.siteName.localeCompare(b.siteName);
  });

  const total = candidates.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const slice = candidates.slice(start, start + limit);

  return {
    page,
    totalPages,
    count: slice.length,
    total,
    styles: slice.map((s) => toShorthand(s)),
    ...(stale ? { cache: stale } : {}),
  };
}
