# refero-mcp — usage recipes

**Refero currently refuses this client, so these work only from a local cache. See the README's Status section.**

Practical examples for the six tools, written the way you'd actually talk to Claude. None of this requires you to know the tool names — Claude picks them. The names are listed only so you can read the trace if you want to.

---

## Recipe 1 — "Find me a dark editorial style with a serif"

> "Find me a dark editorial style in the Refero catalog. Serif, warm accents, minimal chrome."

Tool under the hood: `search_styles`

What Claude does:

1. Hits the local catalog mirror (refreshes if cold).
2. With `OPENAI_API_KEY` set: embeds your query and ranks every style's `northStar` summary by cosine similarity.
3. Without `OPENAI_API_KEY`: keyword-scores against `northStar` + `tags` + `siteName` + `fonts`.
4. Returns the top hits with their `northStar`, color palette, and UUID.

Response shape (abridged):

```jsonc
{
  "hits": [
    {
      "id": "…uuid…",
      "siteName": "Some Editorial Site",
      "northStar": "Warm editorial serif with a dark almost-black ground and a single saffron accent.",
      "colorScheme": "dark",
      "colors": [{ "name": "Ground", "hex": "#0a0a0a" }, { "name": "Saffron", "hex": "#e9a23b" }],
      "score": 0.87,
      "reason": "Strong match on 'editorial', 'serif', and 'warm' anchors."
    },
    // …
  ],
  "totalScanned": 198
}
```

Follow-up prompts that work well:

> "Show me the top 3 with their fonts."
> "Filter those down to dark-mode only."
> "Pull the full breakdown for the second one."

---

## Recipe 2 — "Save Cursor's DESIGN.md into my ACME project"

> "Save Cursor's DESIGN.md into my ACME project."

Tools under the hood: `search_styles` → `get_style` → `save_to_project`

What Claude does:

1. Looks up the style by `siteName` (`search_styles` with a tight name filter).
2. Fetches the full detail (`get_style`) so it has `fullResult.designSystem` in hand.
3. Generates a DESIGN.md — `dos` / `donts` / `tags` / `theme` / role-tagged `colors` / fonts.
4. Writes it to `<REFERO_MCP_VAULT_DIR>/05-Projects/<NAME>/DESIGN.md`. `REFERO_MCP_VAULT_DIR` must be set; if unset, the tool returns the markdown body but refuses to write.

Path resolution:

- The `project` argument is matched as a directory under `REFERO_MCP_VAULT_DIR`.
- If the directory doesn't exist, the tool errors and tells you the resolved path it tried — it does NOT create new project folders silently.
- If `DESIGN.md` already exists at the target, the tool errors and asks you to pass `overwrite: true`. Claude will surface that in the conversation; just say "overwrite it."

Variants:

> "Save it to ACME/Sub-Project instead — Sub-Project is a sub-project."
> "Don't save it yet, just show me the DESIGN.md so I can read it first." *(routes to `get_design_md` instead)*

---

## Recipe 3 — "What's similar to Linear?"

> "What's similar to Linear in the Refero catalog?"

Tool under the hood: `list_similar`

What Claude does:

1. Resolves "Linear" to a Refero `id` (one local lookup).
2. Calls `GET /api/styles/{id}` and returns the `similar` array — Refero's own ranking.
3. No embeddings needed; this comes free from the API.

Response shape:

```jsonc
{
  "anchor": {
    "id": "…uuid…",
    "siteName": "Linear",
    "northStar": "…"
  },
  "similar": [
    { "id": "…", "siteName": "…", "northStar": "…", "colorScheme": "dark" },
    // up to ~6 similar styles, in Refero's ranked order
  ]
}
```

Useful follow-ups:

> "Save the top one's DESIGN.md into my new app project."
> "Of those, which ones use a serif?"
> "Compare Linear's palette to the second one."

---

## Recipe 4 — "Refresh the catalog before a long session"

> "Refresh the Refero catalog — I want to make sure we're working off the latest before we pick a direction."

Tool under the hood: `refresh_catalog`

What Claude does:

1. Walks `/api/styles?page=N` from page 1 until `nextPage === null`.
2. Inserts a 250ms delay between page fetches to stay polite.
3. Dedupes by `id`, normalizes the `createdAt` format, and writes the result to `REFERO_CACHE_DIR`.
4. With `OPENAI_API_KEY` set: re-embeds any new entries' `northStar` summaries. Existing embeddings are kept.
5. Returns a summary: total styles, how many were new, how long it took.

Typical output:

```jsonc
{
  "totalStyles": 198,
  "newStyles": 4,
  "removedStyles": 0,
  "embeddingsRefreshed": 4,
  "durationMs": 2800,
  "cacheDir": "/Users/you/.cache/refero-mcp"
}
```

When to refresh:

- Before a serious design pass on a new project.
- When `search_styles` returns nothing for a query you know should hit (the catalog might've grown).
- When `REFERO_CACHE_TTL_MS` has expired and Claude is reluctant to call again on its own.

---

## Pro tip — chain with the design skills

This MCP doesn't render anything itself. It produces a DESIGN.md that the rest of your toolchain knows how to consume. Two specific pairings:

- **[`/stitch-design-taste`](https://github.com/fidgetcoding/2ndBrain-mogging) — Google Stitch + DESIGN.md.** Generate a DESIGN.md with `save_to_project`, then have `/stitch-design-taste` validate it against the agent-friendly schema and feed it into Stitch for component generation.
- **[`/design-taste-frontend`](https://github.com/fidgetcoding/2ndBrain-mogging) — building the actual UI.** Run `save_to_project` first so DESIGN.md is on disk in the project root. The skill picks it up automatically and overrides default LLM design biases with the role-tagged colors and `dos` / `donts` from Refero.

Together, the loop is: **search Refero → save DESIGN.md → /stitch-design-taste validates → /design-taste-frontend ships components.** No copy-paste, no taste-by-vibe-only, no defaulting to slate-blue and Inter for the eighth time this month.

---

## The 6 tools — at-a-glance reference

| Tool | What it does | Typical sentence |
|---|---|---|
| `search_styles` | NL-or-keyword search across the local catalog mirror | "Find me a warm dark serif style." |
| `get_style` | Fetch full detail + similar for one style by id or name | "Pull the full breakdown for Linear." |
| `list_similar` | Return Refero's own `similar` ranking for a style | "What's similar to Vercel?" |
| `get_design_md` | Generate DESIGN.md content without writing it | "Show me the DESIGN.md before saving it." |
| `save_to_project` | Generate + write DESIGN.md into a vault project | "Save it into my ACME project." |
| `refresh_catalog` | Walk all pages, refresh local mirror + embeddings | "Refresh the Refero catalog." |

For the empirical API contract behind these, see [`api-surface.md`](api-surface.md).
