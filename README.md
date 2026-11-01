<a id="top"></a>

<div align="center">

<img src="https://raw.githubusercontent.com/fidgetcoding/refero-design-mcp/main/.github/banner.png" alt="refero-mcp" width="100%" />

# Refero MCP

**Search [styles.refero.design](https://styles.refero.design) in plain English and drop a DESIGN.md into any project.**

[![npm version](https://img.shields.io/npm/v/fidgetcoding-refero-mcp)](https://www.npmjs.com/package/fidgetcoding-refero-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-green)](https://modelcontextprotocol.io)

[![Follow on X](https://img.shields.io/badge/FOLLOW%20%40fidgetcoding-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/fidgetcoding) [![LinkedIn](https://img.shields.io/badge/LINKEDIN-CONNECT-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white&labelColor=555555)](https://www.linkedin.com/in/nate-davidovich/) [![YouTube](https://img.shields.io/badge/YOUTUBE-SUBSCRIBE-FF0000?style=for-the-badge&logo=youtube&logoColor=white&labelColor=555555)](https://youtube.com/@fidgetcoding) [![Instagram](https://img.shields.io/badge/INSTAGRAM-FOLLOW-E4405F?style=for-the-badge&logo=instagram&logoColor=white&labelColor=555555)](https://instagram.com/fidgetcoding)

</div>

---

## Quick Navigation

| Link | Section | What it does | Time |
|---|---|---|---|
| [Status](#status-refero-is-refusing-this-client) | Read first | Refero blocks this client today | ~1 min |
| [What this is](#what-this-is) | Overview | The catalog, the gap, the wrap | ~1 min |
| [Quick install](#quick-install) | Setup | One line into Claude Code | ~1 min |
| [Usage](#usage) | Talk to it | Plain-English prompts | ~2 min |
| [Tools](#tools) | Reference | The six tools, one line each | ~1 min |
| [Configuration](#configuration) | Setup | Env vars + JSON config | ~1 min |
| [How it works](#how-it-works) | Reference | Cache, embeddings, DESIGN.md generation | ~1 min |
| [Troubleshooting](#troubleshooting) | Reference | The likely first three problems | ~1 min |
| [License + Author](#license) | Meta | MIT | — |

---

## Status: Refero is refusing this client

> [!WARNING]
> **New installs can't search right now.** As of 2026-11-01, `GET styles.refero.design/api/styles` answers this package with HTTP 403 and `{"error":"Please refresh the page and try again."}`. The last successful catalog fetch I have on record is 2026-08-04.

What that means in practice:

| If you have... | What works |
|---|---|
| No local cache | Nothing. Every tool returns a clear error saying why. |
| A cached catalog | `refero_search`, `refero_list`, and `refero_facets` run on that copy. Every result carries a `cache` field saying "Cached, may be stale" with the date. |
| A cached style | `refero_get` and `refero_design_md` work for styles whose full details you fetched before. Others return a clear error. |
| Either | `refero_similar` and `refero_refresh` need the live endpoint, so they return a clear error. A failed refresh leaves your cache alone. |

This package always read an undocumented endpoint, and it won't try to get around the block. Refero's [`robots.txt`](https://styles.refero.design/robots.txt) disallows `/api/`, and its [Terms of Use](https://doc.refero.design/legal/terms-of-use) (updated August 3, 2026) rule out automated extraction outside documented features and bypassing access controls.

**For live data, use [Refero's official MCP](https://refero.design/mcp).** It covers style search and full style guidance (colors, typography, spacing, do/don't rules), plus sites, apps, screens, and flows. It requires a paid Refero plan (Pro, Team, or Lifetime):

```bash
claude mcp add --transport http refero https://api.refero.design/mcp --header "Authorization: Bearer <token>"
```

To check whether this section is still true, run `REFERO_LIVE_TEST=1 npx vitest run tests/live.test.ts`. It sends one request to the real endpoint and fails if the state has changed, in either direction. Because `robots.txt` disallows that path, the test is manual only: it's skipped by default and never runs in CI, so CI won't notice if the state changes.

<p align="right"><a href="#top">↑ back to top</a></p>

---

## What this is

[Refero Styles](https://styles.refero.design) is a beta catalog of about 200 curated sites where someone has done the painful work of pulling out the colors, typography, spacing, and per-style do/don't guidance. Each entry ships with a `designSystem` block that's basically a DESIGN.md waiting to happen.

This MCP wraps that catalog so Claude Code can search it in natural language and drop a generated DESIGN.md straight into whatever project you're scaffolding. No browser-tab JSON copy-paste, no hand-rolled token tables.

It's for anyone using Claude Code to spin up a new app, deck, or client project who wants the design language locked down before the first component renders.

<p align="right"><a href="#top">↑ back to top</a></p>

---

## Quick install

One line:

```bash
claude mcp add refero -- npx -y fidgetcoding-refero-mcp
```

Restart Claude Code and start describing the look you want.

If you want vibe search (semantic ranking against each style's poetic `northStar` summary), pass an OpenAI key:

```bash
claude mcp add refero --env OPENAI_API_KEY=sk-... -- npx -y fidgetcoding-refero-mcp
```

Without it, search falls back to keyword scoring. Works fine, just less magical.

For `claude_desktop_config.json` users:

```json
{
  "mcpServers": {
    "refero": {
      "command": "npx",
      "args": ["-y", "fidgetcoding-refero-mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "REFERO_MCP_VAULT_DIR": "/absolute/path/to/your/vault"
      }
    }
  }
}
```

<p align="right"><a href="#top">↑ back to top</a></p>

---

## Usage

> [!IMPORTANT]
> **You talk. Claude dispatches. No commands, no syntax, no JSON.**
>
> Every tool here is wired to plain-English prompts. You don't memorize tool names or build payloads — Claude picks the tool and fills in the parameters.

A few prompts that route cleanly:

```
"Find me a dark editorial style with a serif and a warm accent."
```

```
"Pull the full breakdown for Linear."
```

```
"What's similar to Vercel in the Refero catalog?"
```

```
"Render Cursor's DESIGN.md — don't save it yet, just show me."
```

```
"Save Cursor's DESIGN.md into my ACME project."
```

```
"Show me only dark-mode brutalist styles, top five."
```

```
"Refresh the Refero catalog before we start the design pass."
```

More worked recipes in [`docs/USAGE.md`](docs/USAGE.md).

<p align="right"><a href="#top">↑ back to top</a></p>

---

## Tools

| Tool | What it does |
|---|---|
| `refero_search` | Natural-language vibe search across the catalog. Embeddings if `OPENAI_API_KEY` is set, BM25-lite fallback if not. |
| `refero_get` | Fetch the full design system for one style. Accepts a uuid, hostname (e.g. `cursor.com`), or site name (e.g. `"Cursor"`). |
| `refero_similar` | Refero's own "similar styles" ranking for a given style. Free recommendations from the upstream. |
| `refero_list` | Browse the local catalog mirror with optional theme/tag filters. Stably ordered. |
| `refero_facets` | What's actually in the catalog — ranked font stacks, color names, theme counts. Call it before guessing search terms: there is no tag taxonomy, so invented tags match nothing, but every value this returns is already in the search index and can be passed straight to `refero_search`. |
| `refero_design_md` | Render a style as an agent-friendly DESIGN.md (frontmatter, north star, color table, dos/donts). Optionally writes to disk. |
| `refero_refresh` | Force a full re-fetch of the catalog and overwrite the local mirror. Skips the 24h TTL. |

<p align="right"><a href="#top">↑ back to top</a></p>

---

## Configuration

Everything is optional. Defaults are picked so the MCP just runs.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `OPENAI_API_KEY` | No | unset | Enables vibe search via `text-embedding-3-small`. Without it, search falls back to keyword scoring. |
| `REFERO_API_BASE` | No | `https://styles.refero.design` | Override if Refero ever moves the API or you're pointing at a fixture. |
| `REFERO_CACHE_DIR` | No | `~/.refero-cache` | Where the local catalog mirror, embeddings, and detail cache live. |
| `REFERO_CACHE_TTL_MS` | No | `86400000` (24h) | How long a cached page is considered fresh. |
| `REFERO_MCP_VAULT_DIR` | No (required for project writes) | unset | Absolute path to the vault root that `refero_design_md` writes into. If unset, the tool returns the markdown but doesn't write to disk. |

A copy-paste `.env.example` ships in the repo root.

> There's no default for `REFERO_MCP_VAULT_DIR`. The previous draft hardcoded my laptop path, which worked great for exactly one machine on Earth. The reviewer caught it. Now if you don't set it, the tool just refuses to write — rude, but better than dropping files into a folder that doesn't exist on your computer.

<p align="right"><a href="#top">↑ back to top</a></p>

---

## How it works

This describes the design, which depends on an endpoint Refero now refuses (see [Status](#status-refero-is-refusing-this-client)). That endpoint was never publicly documented: the shape was mapped empirically against the live site, and the breakdown is in [`docs/api-surface.md`](docs/api-surface.md).

- **Local catalog mirror.** Refero exposes `?page=N` pagination but silently ignores `?search=`, `?q=`, and `?colorScheme=`. So this MCP walks the pages once, mirrors them locally under `REFERO_CACHE_DIR`, and runs all filtering and ranking client-side.
- **Vibe search via `northStar`.** Every Refero style ships with a one-line poetic summary called `northStar`. With `OPENAI_API_KEY` set, the MCP embeds those summaries with `text-embedding-3-small` and ranks by cosine similarity to your query. Without a key, it falls back to keyword scoring on `northStar` + tags + site name.
- **DESIGN.md generated locally.** Refero does not expose a `/design.md` endpoint. The MCP synthesizes one from `style.fullResult.designSystem` (dos, donts, tags, theme, role-tagged colors). Output is compatible with the [`/stitch-design-taste`](https://github.com/fidgetcoding/2ndBrain-mogging) and `/design-taste-frontend` skills.

<p align="right"><a href="#top">↑ back to top</a></p>

---

## Troubleshooting

**"The Refero catalog is unavailable and there is no local copy."** Refero is refusing this client and you have no cache to fall back on. See [Status](#status-refero-is-refusing-this-client). Refreshing won't help.

**Results say "Cached, may be stale".** The live refresh failed, so you're getting your last good copy. The note gives its date and the reason.

**Search results feel keyword-y rather than semantic.** You probably don't have `OPENAI_API_KEY` set. Add it to your MCP config and restart, or lean harder on the catalog's vocabulary (industries plus tags like `editorial`, `brutalist`, `glass`).

**`refero_design_md` returns markdown but won't write to disk.** `REFERO_MCP_VAULT_DIR` is unset. Set it to your vault root (absolute path) and the tool will write to `<vault>/05-Projects/<NAME>/DESIGN.md`. Without it, you get the markdown back in conversation and can paste it wherever.

<p align="right"><a href="#top">↑ back to top</a></p>

---

## License

MIT — see [LICENSE](LICENSE) for details.

## Author

Built by **Nate Davidovich** / [Lorecraft LLC](https://github.com/lorecraft-io).

- GitHub: [lorecraft-io](https://github.com/lorecraft-io)
- npm: [lorecraft](https://www.npmjs.com/~lorecraft)
- Sister projects: [morgen-mcp](https://github.com/fidgetcoding/morgen-mcp), [motion-mcp](https://github.com/fidgetcoding/motion-mcp)

[⤴ back to top](#top)

---

## Security: gitleaks scan

This repo ships with a `.gitleaks.toml` config and a `scripts/security-scan.sh`
helper that scans the working tree for secrets (GitHub tokens, API keys, JWTs,
private keys, Anthropic keys, etc.).

```bash
bash scripts/security-scan.sh
```

A `.husky/pre-commit` hook also runs `gitleaks protect --staged` on every commit
and warn-no-ops if `gitleaks` isn't installed locally.

If you don't have it yet:
- macOS: `brew install gitleaks`
- Linux: https://github.com/gitleaks/gitleaks/releases
