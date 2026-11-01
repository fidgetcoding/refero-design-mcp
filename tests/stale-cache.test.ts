/**
 * refero-mcp — behaviour when Refero is unavailable.
 *
 * The live path can fail in ways the happy-path tests never see: a 403, a
 * network drop, or a 200 with nothing in it. These tests pin what the user gets
 * then: the last good copy with a clear note, or a clear error when there is no
 * copy, and never a good local catalog overwritten by a bad response.
 *
 * Author: Nate Davidovich (Lorecraft LLC)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { readCatalog, writeCatalog, writeStyle } from "../src/cache.js";
import { _resetScorerForTest } from "../src/embeddings.js";
import { handleDesignMd } from "../src/tools/design-md.js";
import { handleFacets } from "../src/tools/facets.js";
import { handleGet } from "../src/tools/get.js";
import { handleList } from "../src/tools/list.js";
import { handleRefresh } from "../src/tools/refresh.js";
import { handleSearch } from "../src/tools/search.js";
import { ReferoUnavailableError } from "../src/tools/shared.js";
import { handleSimilar } from "../src/tools/similar.js";
import type { FullStyle, StyleListItem } from "../src/types.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ORIGINAL_ENV = { ...process.env };
const DAY_MS = 24 * 60 * 60 * 1000;

function loadFixture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(TEST_DIR, "fixtures", name), "utf8")) as T;
}
const catalog = (): StyleListItem[] => loadFixture<{ styles: StyleListItem[] }>("catalog.json").styles;
const detail = (): FullStyle => loadFixture<{ style: FullStyle }>("elevenlabs-detail.json").style;

/** Every request gets the response Refero gave on 2026-11-01. */
function stubRefused(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () =>
      new Response('{"error":"Please refresh the page and try again."}', {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Rewrite a cache file's timestamp so it looks `days` old. */
function age(file: string, days: number): void {
  const full = path.join(cacheDir, file);
  const data = JSON.parse(fs.readFileSync(full, "utf8")) as { updatedAt: number };
  data.updatedAt = Date.now() - days * DAY_MS;
  fs.writeFileSync(full, JSON.stringify(data));
}

let cacheDir: string;

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "refero-mcp-stale-"));
  process.env = { ...ORIGINAL_ENV };
  process.env.REFERO_CACHE_DIR = cacheDir;
  process.env.REFERO_CACHE_TTL_MS = String(DAY_MS);
  delete process.env.OPENAI_API_KEY;
  _resetScorerForTest();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  _resetScorerForTest();
  fs.rmSync(cacheDir, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
});

describe("stale catalog, Refero refusing", () => {
  beforeEach(async () => {
    await writeCatalog(catalog());
    age("catalog.json", 88);
  });

  it("refero_search serves the old catalog and says so", async () => {
    stubRefused();
    const out = await handleSearch({ query: "warm editorial serif" });

    expect(out.results.length).toBeGreaterThan(0);
    expect(out.cache?.status).toBe("stale");
    expect(out.cache?.ageDays).toBe(88);
    expect(out.cache?.note).toMatch(/^Cached, may be stale/);
    expect(out.cache?.note).toContain("HTTP 403");
    expect(out.cache?.note).toContain("refero.design/mcp");
  });

  it("refero_list and refero_facets carry the same note", async () => {
    stubRefused();
    const list = await handleList({});
    const facets = await handleFacets({});

    expect(list.styles.length).toBeGreaterThan(0);
    expect(list.cache?.status).toBe("stale");
    expect(facets.total).toBeGreaterThan(0);
    expect(facets.cache?.status).toBe("stale");
  });

  it("leaves the local catalog untouched", async () => {
    stubRefused();
    const before = await readCatalog();
    await handleSearch({ query: "serif" });
    expect(await readCatalog()).toEqual(before);
  });

  it("refero_get serves a cached style with the note", async () => {
    const style = detail();
    await writeStyle(style.id, style);
    age(path.join("styles", `${style.id}.json`), 88);
    stubRefused();

    const out = await handleGet({ identifier: style.id });
    expect(out.id).toBe(style.id);
    expect(out.cache?.status).toBe("stale");
  });

  it("refero_design_md renders a cached style with the note", async () => {
    const style = detail();
    await writeStyle(style.id, style);
    age(path.join("styles", `${style.id}.json`), 88);
    stubRefused();

    const out = await handleDesignMd({ identifier: style.id });
    expect(out.markdown.length).toBeGreaterThan(0);
    expect(out.cache?.status).toBe("stale");
  });

  it("refero_get explains itself when that style's details were never cached", async () => {
    stubRefused();
    const err = await handleGet({ identifier: detail().id }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ReferoUnavailableError);
    expect((err as Error).message).toContain("not cached");
    expect((err as Error).message).toContain("HTTP 403");
  });

  it("refero_similar explains that it needs live data", async () => {
    stubRefused();
    const err = await handleSimilar({ identifier: detail().id }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ReferoUnavailableError);
    expect((err as Error).message).toContain("live recommendations");
  });

  it("refero_refresh reports the failure and keeps the old catalog", async () => {
    stubRefused();
    const before = await readCatalog();
    const err = await handleRefresh({}).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ReferoUnavailableError);
    expect((err as Error).message).toContain("left as it is");
    expect(await readCatalog()).toEqual(before);
  });
});

describe("other ways the live path fails", () => {
  it("falls back when a response can't be parsed", async () => {
    await writeCatalog(catalog());
    age("catalog.json", 3);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new SyntaxError("not json");
      }),
    );

    const out = await handleSearch({ query: "serif" });
    expect(out.cache?.status).toBe("stale");
    expect(out.cache?.note).toContain("not json");
  });

  it("a 200 with an empty catalog never replaces a good one", async () => {
    await writeCatalog(catalog());
    age("catalog.json", 3);
    const before = await readCatalog();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ styles: [], nextCursor: null, nextPage: null }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const out = await handleSearch({ query: "serif" });
    expect(out.cache?.status).toBe("stale");
    expect(await readCatalog()).toEqual(before);
  });
});

describe("no cache at all", () => {
  it("every catalog tool gives a clear error instead of an empty result", async () => {
    stubRefused();
    for (const call of [
      () => handleSearch({ query: "serif" }),
      () => handleList({}),
      () => handleFacets({}),
    ]) {
      const err = await call().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ReferoUnavailableError);
      expect((err as Error).message).toContain("no local copy");
      expect((err as Error).message).toContain("HTTP 403");
      expect((err as Error).message).toContain("refero.design/mcp");
    }
  });

  it("an empty or corrupt cache file counts as no cache", async () => {
    stubRefused();
    fs.writeFileSync(path.join(cacheDir, "catalog.json"), JSON.stringify({ updatedAt: Date.now(), styles: [] }));
    await expect(handleSearch({ query: "serif" })).rejects.toBeInstanceOf(ReferoUnavailableError);

    fs.writeFileSync(path.join(cacheDir, "catalog.json"), "{ not json");
    await expect(handleSearch({ query: "serif" })).rejects.toBeInstanceOf(ReferoUnavailableError);
  });
});

describe("healthy path stays quiet", () => {
  it("a fresh cache carries no note and makes no request", async () => {
    await writeCatalog(catalog());
    const fetchMock = stubRefused();

    const out = await handleSearch({ query: "serif" });
    expect(out.cache).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
