# Changelog

All notable changes to `fidgetcoding-refero-mcp` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-11-01

### Fixed

- **Search failed outright when Refero refused the request, even with a good local catalog.** Refero now answers this client's `/api/styles` calls with HTTP 403, and any failed refresh threw the error away with the cache. A failed refresh now serves the last good copy, with a `cache` field on the result saying "Cached, may be stale", the date, and the reason. Applies to `refero_search`, `refero_list`, `refero_facets`, `refero_get`, and `refero_design_md`.
- **Clear errors when there is nothing to fall back on.** No cache, a style whose details were never fetched, `refero_similar`, and `refero_refresh` each say what failed and point at Refero's official MCP.
- **A 200 with an empty catalog could wipe a good local copy.** It now counts as a failed fetch.

### Added

- `tests/live.test.ts`, the one test that calls the real Refero endpoint. Every other test fakes `fetch`, which is how the suite stayed green through the 403. It fails if the endpoint's state stops matching the README. Manual only, because `robots.txt` disallows the path: it needs `REFERO_LIVE_TEST=1` and never runs in CI. It also skips on no network, a 5xx, or rate limiting.

### Changed

- README: states that the upstream is blocked, what still works, and that Refero's official MCP is the supported route.
- `package.json` description now says what the package does and that Refero currently blocks it.

### Security

- `openai` (optional, embeddings only) from `^4.60.0` to `^6.49.0`, because 4.x pins `zod` to a version with a high advisory. This package only calls `embeddings.create`, whose call shape is unchanged. Plus a lockfile refresh of transitive dependencies. `npm audit --omit=dev` now reports 0.

## [0.2.0] — 2026-08-04

### Added

- **`refero_facets`** — catalog vocabulary discovery. Returns ranked font stacks, named colors, and theme counts over the cached catalog, optionally scoped to one theme. Exists because the list projection carries no tag taxonomy, so an agent reaching for `tags` is guessing at words that may appear nowhere; every value this returns is already covered by `searchText`, so it round-trips into `refero_search` as a query. Pure computation over the existing cache — no new network surface. 17 new tests.

### Security

- npm advisories reduced from 12 (6 high / 4 moderate / 2 low) to 1 via a transitive-dependency refresh. The remaining item is a **low**, dev-only `esbuild` advisory (arbitrary file read while running esbuild's dev server on Windows) reachable only through vitest. Clearing it requires a breaking major bump of the test toolchain to fix a Windows dev-server issue on a macOS-developed, stdio-only package — deliberately left in place.

### Fixed

- `SERVER_VERSION` was hard-coded to `0.1.0` in `src/server.ts`, so the `initialize` handshake would have kept reporting 0.1.0 after every subsequent release. Now read from `package.json`. `tsc` emits `src/server.ts` to `dist/server.js`, so `../package.json` resolves to the repo root from both the published package and the vitest run of `src/`. Guarded by a test asserting `SERVER_INFO.version` equals the manifest version.
- Publish workflow was a DRAFT that only ever ran `npm publish --dry-run` behind a `confirm: "draft-noop"` gate — it could never ship a release, and 0.1.0 went out by hand. Replaced with the OIDC + provenance workflow used by motion-mcp and morgen-mcp, triggered on `v*` tags. The comment claiming "OIDC publish doesn't work for our setup" was wrong; the original blocker was a trusted-publisher record bound to the wrong repository.

## [0.1.0] — 2026-05-01

Initial release. Wraps the (undocumented) `styles.refero.design` API and exposes it to Claude Code as an MCP server.

### Added

- **6 MCP tools:**
  - `refero_search` — natural-language or keyword search across a local mirror of the Refero catalog. Uses OpenAI `text-embedding-3-small` against each style's `northStar` summary when `OPENAI_API_KEY` is set; falls back to keyword scoring otherwise.
  - `refero_get` — fetch full detail (`fullResult.designSystem`, `raw` tokens, `meta`) for one style by uuid, hostname, or site name.
  - `refero_similar` — return Refero's free, server-side similarity ranking for a style id or site name.
  - `refero_list` — paginated browse of the local catalog mirror with optional theme/tag filters.
  - `refero_design_md` — generate a DESIGN.md from `style.fullResult.designSystem`. Returns the markdown body; if `save_to_project` is passed and `REFERO_MCP_VAULT_DIR` is set, also writes to `<vault>/05-Projects/<NAME>/DESIGN.md`.
  - `refero_refresh` — walk the paginated `/api/styles` endpoint, mirror locally, refresh embeddings for new entries.
- **Empirical API surface document** at `docs/api-surface.md` covering both endpoints, all observed query parameters (and which ones are silently ignored), full response shapes, the date-format inconsistency between list and detail, and pagination semantics.
- **Local catalog mirror** under `REFERO_CACHE_DIR` (default `~/.refero-cache`), keyed by style UUID with `createdAt` normalized to ISO 8601.
- **Polite refresh strategy** — 250ms delay between page fetches, single retry on `5xx`, no retry on `4xx`.
- **DESIGN.md generation** from `style.fullResult.designSystem` — dos, donts, tags, theme, role-tagged colors, fonts. Output is compatible with the `/stitch-design-taste` and `/design-taste-frontend` skills.
- **Configurable vault root** via `REFERO_MCP_VAULT_DIR` so `save_to_project` writes to the right place for any user, not just the author.

### Notes

- No public Refero API doc exists as of this release. The contract is empirically derived; see `docs/api-surface.md` for the investigation log.
- Server-side filters (`?search=`, `?q=`, `?colorScheme=`) are silently ignored by Refero — the MCP filters and ranks client-side against the local mirror.
- Rate limits are unobserved; the MCP self-imposes a 250ms inter-page delay during catalog refreshes as a politeness floor.

[0.1.0]: https://github.com/fidgetcoding/refero-design-mcp/releases/tag/v0.1.0
