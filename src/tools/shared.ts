/**
 * Shared helpers for tool handlers.
 *
 * - `ensureCatalog()` returns a fresh catalog (refreshing from the network if
 *   stale or absent). If the refresh fails it serves the last good copy with a
 *   `StaleNotice`, and throws `ReferoUnavailableError` when there is no copy.
 * - `ensureStyle()` does the same for a single FullStyle.
 * - `toShorthand()` projects a StyleListItem (+ optional score) to the
 *   compact shape used by search/similar/list responses.
 *
 * Author: Nate Davidovich (Lorecraft LLC)
 */
import {
  isFresh,
  readCatalog,
  readStyle,
  writeCatalog,
  writeStyle,
} from "../cache.js";
import { getById, listPage } from "../refero.js";
import { ReferoApiError } from "../types.js";
import type {
  ColorScheme,
  FullStyle,
  StyleListItem,
} from "../types.js";

/** Attached to a tool result that was served from an out-of-date local copy. */
export interface StaleNotice {
  status: "stale";
  /** Human-readable, safe to show as-is. Starts with "Cached, may be stale". */
  note: string;
  /** ISO timestamp of the last successful fetch. */
  cachedAt: string;
  ageDays: number;
}

/** Refero could not be reached or refused us, and no local copy can stand in. */
export class ReferoUnavailableError extends Error {
  public override readonly name = "ReferoUnavailableError";
}

// No scheme on the URL: the server's safeMessage() redacts http(s) URLs.
export const OFFICIAL_MCP_HINT =
  "Refero's official MCP (refero.design/mcp, paid plan) is the supported way to get live data.";

const DAY_MS = 24 * 60 * 60 * 1000;

/** One-line reason for a failed Refero call, in plain words. */
export function describeFailure(err: unknown): string {
  if (err instanceof ReferoApiError && err.status > 0) {
    return err.status === 401 || err.status === 403
      ? `Refero refused the request (HTTP ${err.status})`
      : `Refero returned HTTP ${err.status}`;
  }
  return `Could not get a usable response from Refero (${
    err instanceof Error ? err.message : "unknown error"
  })`;
}

function staleNotice(updatedAt: number, err: unknown): StaleNotice {
  const cachedAt = new Date(updatedAt).toISOString();
  const ageDays = Math.floor((Date.now() - updatedAt) / DAY_MS);
  return {
    status: "stale",
    note:
      `Cached, may be stale: this data is from ${cachedAt.slice(0, 10)} (${ageDays} days old). ` +
      `${describeFailure(err)}. ${OFFICIAL_MCP_HINT}`,
    cachedAt,
    ageDays,
  };
}

/** Compact projection used by search, similar, list. */
export interface StyleShorthand {
  id: string;
  siteName: string;
  url: string;
  northStar: string;
  theme: ColorScheme;
  tags: string[];
  thumbnailUrl: string;
  score?: number;
}

/** Full-style shorthand used by `refero_get`. */
export interface FullStyleShorthand {
  id: string;
  siteName: string;
  url: string;
  northStar: string;
  theme: ColorScheme;
  industry: string;
  colors: FullStyle["fullResult"]["designSystem"]["colors"];
  fonts: string[];
  designSystem: FullStyle["fullResult"]["designSystem"];
  screenshotUrl: string;
  thumbnailUrl: string;
}

const PAGE_FETCH_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function toShorthand(
  item: StyleListItem,
  opts: { score?: number; tags?: string[] } = {},
): StyleShorthand {
  return {
    id: item.id,
    siteName: item.siteName,
    url: item.url,
    northStar: item.northStar,
    theme: item.colorScheme,
    tags: opts.tags ?? [],
    thumbnailUrl: item.thumbnailUrl,
    ...(opts.score !== undefined ? { score: opts.score } : {}),
  };
}

export function toFullStyleShorthand(full: FullStyle): FullStyleShorthand {
  const ds = full.fullResult.designSystem;
  return {
    id: full.id,
    siteName: full.siteName,
    url: full.url,
    northStar: full.northStar,
    theme: ds.theme ?? full.colorScheme,
    industry: full.industry,
    colors: ds.colors ?? [],
    fonts: ds.fonts ?? full.fonts ?? [],
    designSystem: ds,
    screenshotUrl: full.screenshotUrl,
    thumbnailUrl: full.thumbnailUrl,
  };
}

/**
 * Walk every page of `/api/styles?page=N` until exhausted. Used by both
 * `refero_refresh` and the lazy refresh path inside `ensureCatalog`.
 */
export async function fetchFullCatalog(): Promise<{
  styles: StyleListItem[];
  pagesFetched: number;
}> {
  const seen = new Map<string, StyleListItem>();
  let page = 1;
  let pagesFetched = 0;
  // Hard cap so a server-side bug can't run us forever.
  const MAX_PAGES = 200;

  while (page > 0 && page <= MAX_PAGES) {
    const res = await listPage(page);
    pagesFetched++;
    const items = Array.isArray(res.styles) ? res.styles : [];
    for (const item of items) {
      if (!item || typeof item.id !== "string") continue;
      seen.set(item.id, item);
    }
    if (items.length === 0) break;
    if (res.nextPage === null || res.nextPage === undefined) break;
    page = res.nextPage;
    await sleep(PAGE_FETCH_DELAY_MS);
  }

  // An empty catalog is a broken response, not a catalog. Callers overwrite the
  // local copy with this result, so it must never replace a good one.
  if (seen.size === 0) {
    throw new ReferoApiError("Refero returned an empty catalog", 0, null);
  }

  return { styles: Array.from(seen.values()), pagesFetched };
}

export interface CatalogLoad {
  styles: StyleListItem[];
  /** Present only when the live refresh failed and this is an old local copy. */
  stale?: StaleNotice;
}

/**
 * Return the catalog, refreshing from the network if it's stale or missing.
 * Pass `forceRefresh: true` to skip the freshness check.
 *
 * A failed refresh falls back to the last good local copy, flagged with a
 * `StaleNotice`. With no local copy it throws `ReferoUnavailableError`.
 */
export async function ensureCatalog(
  opts: { forceRefresh?: boolean } = {},
): Promise<CatalogLoad> {
  const cached = await readCatalog();
  const usable = cached && Array.isArray(cached.styles) && cached.styles.length > 0 ? cached : null;
  if (usable && !opts.forceRefresh && isFresh(usable.updatedAt)) {
    return { styles: usable.styles };
  }

  let styles: StyleListItem[];
  try {
    ({ styles } = await fetchFullCatalog());
  } catch (err) {
    if (usable) {
      const stale = staleNotice(usable.updatedAt, err);
      console.error(JSON.stringify({ event: "catalog_stale", ageDays: stale.ageDays, reason: describeFailure(err) }));
      return { styles: usable.styles, stale };
    }
    throw new ReferoUnavailableError(
      `The Refero catalog is unavailable and there is no local copy to fall back on. ` +
        `${describeFailure(err)}. ${OFFICIAL_MCP_HINT}`,
    );
  }
  await writeCatalog(styles);
  return { styles };
}

export interface StyleLoad {
  style: FullStyle;
  /** Present only when the live fetch failed and this is an old local copy. */
  stale?: StaleNotice;
}

/**
 * Return a FullStyle for `id`, fetching + caching if missing or stale. Falls
 * back the same way `ensureCatalog` does.
 */
export async function ensureStyle(id: string): Promise<StyleLoad> {
  const cached = await readStyle(id);
  if (cached && isFresh(cached.updatedAt)) {
    return { style: cached.style };
  }
  let style: FullStyle;
  try {
    ({ style } = await getById(id));
  } catch (err) {
    if (cached) {
      return { style: cached.style, stale: staleNotice(cached.updatedAt, err) };
    }
    throw new ReferoUnavailableError(
      `Full details for this style are not cached, and they can't be fetched now. ` +
        `${describeFailure(err)}. ${OFFICIAL_MCP_HINT}`,
    );
  }
  await writeStyle(id, style);
  return { style };
}

/** Build the text blob a Scorer searches over for a given list item. */
export function searchText(item: StyleListItem): string {
  const parts: string[] = [
    item.siteName,
    item.northStar,
    item.url,
    ...(item.fonts ?? []),
    ...(item.colors ?? []).map((c) => `${c.name} ${c.hex}`),
  ];
  return parts.filter(Boolean).join("\n");
}

/** Theme/tag filters shared by search and list. */
export function applyFilters(
  styles: StyleListItem[],
  filters: { theme?: ColorScheme; tags?: string[] },
  tagsForId?: Map<string, string[]>,
): StyleListItem[] {
  let result = styles;
  if (filters.theme) {
    result = result.filter((s) => s.colorScheme === filters.theme);
  }
  if (filters.tags && filters.tags.length > 0) {
    const wanted = filters.tags.map((t) => t.toLowerCase());
    result = result.filter((s) => {
      const tags = (tagsForId?.get(s.id) ?? []).map((t) => t.toLowerCase());
      // List-only items have no tags. Only filter them in if we have detail.
      if (tags.length === 0) return false;
      return wanted.every((w) => tags.includes(w));
    });
  }
  return result;
}
