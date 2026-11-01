# styles.refero.design — empirical API surface

> **Historical.** As of 2026-11-01 these endpoints answer this client with HTTP 403, and `robots.txt` now disallows `/api/`. Kept as a record of what the client was built against. See the README's Status section.

> **Date of investigation:** 2026-05-01
> **Tested against:** the live production site at `https://styles.refero.design` (beta).
> **Status:** No public schema, no docs page, no sitemap, no `robots.txt`. Everything below was derived by poking the live `/api/styles` endpoints with `curl`. Treat this file as the source of truth for the HTTP contract until Refero ships official docs.

This document exists so future-Nate (or anyone else) doesn't re-derive any of this from scratch. If a field listed here disappears or changes shape, that's a Refero-side break — bump and patch.

---

## Base URL

```
https://styles.refero.design
```

No `/v1`, no API subdomain. The marketing site and the JSON API live at the same origin.

There are exactly two endpoints worth wrapping:

| Endpoint | Verb | Returns | Notes |
|---|---|---|---|
| `/api/styles` | `GET` | `StylesListResponse` | Paginated list. ~20 styles per page. ~200 total in beta. |
| `/api/styles/{uuid}` | `GET` | `StyleDetailResponse` | Full extraction + Refero's own `similar` ranking. |

There is **no** `/api/styles/{uuid}/design.md` endpoint — DESIGN.md output is generated client-side from `style.fullResult.designSystem`. There is also no search, suggest, recommend, embeddings, or batch endpoint. If you want any of those, you build them yourself on top of the cached list.

---

## Query parameters — what works, what doesn't

Tested 2026-05-01. The asymmetry here is the single biggest reason this MCP exists: half the parameters Refero accepts on the URL are silently ignored. You can't tell from a `200 OK` whether it filtered anything.

| Param | On `/api/styles` | Behavior |
|---|---|---|
| `page` | ✅ works | Page-based pagination, 1-indexed. `?page=1` is the default. |
| `limit` | ❌ ignored | Page size is fixed server-side at ~20. Passing `?limit=50` returns 20. |
| `cursor` | ❌ ignored | The `nextCursor` field in responses is reserved — always `null` today. |
| `search` | ❌ silently ignored | Returns the unfiltered page. **Filter client-side.** |
| `q` | ❌ silently ignored | Same as above. |
| `colorScheme` | ❌ silently ignored | Returns mixed light/dark. Filter client-side on `colorScheme`. |
| `color` | ❌ silently ignored | No server-side color filter exists. |

The list endpoint is effectively read-only and unfilterable. Treat it as a pull-the-whole-catalog operation, mirror it locally, and run all filtering / ranking against the local copy.

`/api/styles/{uuid}` takes no query parameters that matter — only the path UUID.

---

## `GET /api/styles?page=N`

### Response shape

```ts
interface StylesListResponse {
  styles: StyleListItem[];           // ~20 items per page
  nextCursor: string | null;         // always null in observed responses
  nextPage: number | null;           // increment until null = end of catalog
}
```

Pagination contract: walk pages 1, 2, 3, … until `nextPage === null`. The total count today is roughly 200 styles spread across ~10 pages, but don't hardcode that — it changes as Refero adds entries.

### `StyleListItem` field reference

```ts
interface StyleListItem {
  id: string;                        // UUID, used in /api/styles/{id}
  url: string;                       // the source site URL
  siteName: string;                  // human-readable, e.g. "Linear"

  // Preview imagery (static)
  screenshotUrl: string;
  thumbnailUrl: string;
  iconUrl: string | null;

  // Loop preview video (small)
  previewVideoUrl: string;
  previewVideoPosterUrl: string;
  previewVideoWidth: number;
  previewVideoHeight: number;

  // Detail preview video (large)
  previewVideoDetailUrl: string;
  previewVideoDetailPosterUrl: string;
  previewVideoDetailWidth: number;
  previewVideoDetailHeight: number;

  previewVideoDurationMs: number;

  colorScheme: "light" | "dark";
  colors: { name: string; hex: string }[];
  fonts: string[];

  // The most useful field in the whole API:
  northStar: string;                 // one-line poetic vibe summary

  createdAt: string;                 // "YYYY-MM-DD HH:MM:SS" UTC (no T, no Z)
}
```

**Why `northStar` matters.** It's the field every NL search anchor wants. Refero writes them as one-line vibe descriptors ("warm editorial serif with a brutalist undercoat" — that flavor) and they're miles better as embedding inputs than the site name or fonts list. If you only embed one field, embed this one.

---

## `GET /api/styles/{uuid}`

### Response shape

```ts
interface StyleDetailResponse {
  style: FullStyle;
  similar: StyleListItem[];          // Refero's own ranking — free recommendations
}
```

The `similar` array is gold. Refero already has an internal similarity ranking, so we get free recommendation output without computing anything ourselves. Use it as a fallback when embeddings aren't configured, and as a sanity check when they are.

### `FullStyle` — adds to `StyleListItem`

```ts
interface FullStyle extends StyleListItem {
  industry: string;                  // e.g. "ai", "finance", "saas"
  previewVideoCapturedAt: string;    // ISO 8601 here (see date quirk)
  createdAt: string;                 // ISO 8601 here (different format vs list!)
  fullResult: FullResult;
}
```

### `FullResult`

```ts
interface FullResult {
  meta: {
    url: string;
    siteName: string;
    extractedAt: string;             // ISO 8601
    durationMs: number;
    viewport: { width: number; height: number };
    elementCount: number;
    telemetry: unknown;              // Refero internal — don't depend on shape
  };
  raw: FullResultRaw;                // see below
  designSystem: DesignSystem;        // canonical DESIGN.md source
  screenshot: unknown;               // capture metadata, not schema-locked
}
```

### `DesignSystem` — the DESIGN.md source

```ts
interface DesignSystem {
  dos: string[];                     // do this
  donts: string[];                   // don't do this
  tags: string[];                    // ["editorial", "brutalist", "glass", ...]
  theme: "light" | "dark";
  colors: {
    hex: string;
    name: string;
    role: string;                    // "primary", "background", "accent", ...
    group: string;                   // "brand", "surface", "text", ...
  }[];
  fonts?: string[];
}
```

This is the entire reason to build this MCP. The `dos` / `donts` arrays are per-style guidance written by Refero's curators. The `colors` array is roles-and-groups, not just hexes. Generate DESIGN.md from this object — don't try to roll your own from `raw.colors.tokens`.

### `FullResultRaw` — fine-grained tokens

```ts
interface FullResultRaw {
  colors: {
    tokens: ColorToken[];            // see below
    [key: string]: unknown;          // forward-compatible
  };
  gradients: unknown;                // not schema-locked yet
  shapes: unknown;                   // not schema-locked yet
  spacing: unknown;                  // not schema-locked yet
  typography: unknown;               // not schema-locked yet
}
```

Only `raw.colors.tokens` is currently typed. The other four buckets exist on every style, but Refero's shape changes between releases and we haven't pinned them. Treat as `unknown` and narrow at the call site.

### `ColorToken`

```ts
interface ColorToken {
  hex: string;
  oklch: { c: number; h: number; l: number };
  contexts: string[];                // ["button", "nav", "heading", ...]
  frequency: number;
  confidence: number;
  prominence: number;
  properties: string[];              // ["borderColor", "boxShadow", ...]
}
```

Useful when you want to know which color shows up on which CSS property. Use `designSystem.colors` for the human-readable summary; reach for `raw.colors.tokens` only when generating fine-grained Tailwind config or CSS variables.

---

## Date format inconsistency (known quirk)

Refero serializes `createdAt` (and a few sibling fields) in **two different formats** depending on which endpoint returned them:

| Endpoint | Format | Example |
|---|---|---|
| `/api/styles?page=N` | space-separated UTC | `"2026-04-22 18:31:14"` |
| `/api/styles/{uuid}` | ISO 8601 | `"2026-04-22T18:31:14.000Z"` |

Don't trust the format — type the field as `string` and parse on read. The local catalog should normalize to ISO 8601 before storage.

---

## Pagination details

- **Page size:** ~20 styles per page (server-fixed; `?limit=` is ignored).
- **Total volume:** ~200 styles in beta (≈10 pages) as of 2026-05-01.
- **End condition:** `nextPage === null`.
- **Stability:** Pages are not stable across writes. If Refero adds new styles, they appear at the start of page 1, which means a paginated walk that races against an insert can either skip or duplicate an entry. The fix is keying the local mirror by `id` (UUID), not by page slot — duplicates dedupe themselves and any skipped IDs surface on the next refresh.

---

## Rate limits

**Unknown.** We did not stress-test the API and have no observed `429` response shape to document. Until that changes, the MCP follows a self-imposed politeness rule:

- **Refresh walks insert a 250ms delay between page fetches.** With ~10 pages, that's ~2.5s for a full refresh and zero risk of looking like a scraper.
- **Detail fetches** are issued one at a time on demand (a single `get_style` call is one HTTP request).
- **No retries** on `4xx` errors — surface them to the caller. Retry once on `5xx` after a 1s backoff, then give up.

If Refero starts surfacing rate-limit headers (`X-RateLimit-*`, `Retry-After`), update the client to honor them and document the budget here.

---

## Error envelope

Refero returns plain `application/json` on success and an error envelope on failure:

```ts
interface ReferoErrorBody {
  error?: string;
  message?: string;
  statusCode?: number;
}
```

In practice: `404` on missing UUIDs, occasional `500` on cold extraction. No `401` or `403` observed (the API is currently unauthenticated). The MCP wraps both as a `ReferoApiError` (see `src/types.ts`) so consumers always get a structured failure with `status` and `body` fields.

---

## What's NOT in the API

So future-me doesn't go looking for these:

- ❌ No search / query / suggest endpoint
- ❌ No `/design.md` endpoint (we synthesize locally)
- ❌ No embeddings or "similar by vector" endpoint
- ❌ No batch / multi-id detail endpoint
- ❌ No user / favorites / collection endpoints
- ❌ No webhooks, no streaming
- ❌ No public OpenAPI / Swagger / JSON Schema doc
- ❌ No `robots.txt`
- ❌ No `sitemap.xml`

If any of these ship, this doc gets a new section and the MCP gets a thinner layer.

---

## Investigation log

| Date | What we tested | Result |
|---|---|---|
| 2026-05-01 | `GET /api/styles` | 200, ~20 items, `nextPage: 2` |
| 2026-05-01 | `GET /api/styles?page=2..N` | walks cleanly, `nextPage: null` at end |
| 2026-05-01 | `?limit=50`, `?limit=5` | ignored, always 20 |
| 2026-05-01 | `?search=linear`, `?q=linear` | ignored, full unfiltered page |
| 2026-05-01 | `?colorScheme=dark`, `?color=red` | ignored, mixed schemes returned |
| 2026-05-01 | `?cursor=abc` | ignored, `nextCursor` always `null` |
| 2026-05-01 | `GET /api/styles/{valid-uuid}` | 200, full `style` + `similar` |
| 2026-05-01 | `GET /api/styles/not-a-uuid` | 4xx with JSON envelope |
| 2026-05-01 | `GET /api/styles/{uuid}/design.md` | 404, endpoint does not exist |
| 2026-05-01 | `GET /robots.txt` | 404 |
| 2026-05-01 | `GET /sitemap.xml` | 404 |
| 2026-05-01 | rate-limit probing | not performed; see "Rate limits" above |

If you re-test any of this, append a row with the new date and what you saw — even if "still the same."
