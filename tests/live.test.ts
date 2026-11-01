/**
 * refero-mcp — the one test that talks to the real Refero.
 *
 * Everything else fakes `fetch`, which is how the whole suite stayed green while
 * the package's own client was getting 403s. This calls the real endpoint once,
 * through the package's real client, and checks it against EXPECTED below, which
 * must match the Status section of the README. Any change in either direction
 * fails: a working endpoint that stops working, or a blocked one that reopens or
 * starts failing differently.
 *
 * Manual only, because Refero's robots.txt disallows /api/. It stays skipped and
 * sends nothing unless you run it yourself with REFERO_LIVE_TEST=1, and it never
 * runs in CI, even with that set:
 *
 *   REFERO_LIVE_TEST=1 npx vitest run tests/live.test.ts
 *
 * It also skips when the result says nothing about Refero's policy: no network,
 * a 5xx, or rate limiting.
 *
 * Author: Nate Davidovich (Lorecraft LLC)
 */
import { describe, expect, it } from "vitest";

import { listPage } from "../src/refero.js";
import { ReferoApiError, type StylesListResponse } from "../src/types.js";

/** Keep in sync with the README's Status section. Last checked 2026-11-01. */
const EXPECTED: "blocked" | "open" = "blocked";

const ENABLED = process.env.REFERO_LIVE_TEST === "1" && !process.env.CI;

describe("live Refero endpoint", () => {
  it.runIf(ENABLED)(`is ${EXPECTED}, as the README says`, { timeout: 60_000 }, async (ctx) => {
    let page: StylesListResponse | null = null;
    let refusedWith: number | null = null;
    try {
      page = await listPage(1);
    } catch (err) {
      if (!(err instanceof ReferoApiError)) throw err;
      if (err.status === 0 || err.status === 429 || err.status >= 500) {
        ctx.skip(`inconclusive: ${err.message}`);
      }
      refusedWith = err.status;
    }

    if (EXPECTED === "blocked") {
      expect(
        refusedWith,
        page
          ? "Refero is serving the catalog again. Set EXPECTED to open and update the README's Status section."
          : "Refero is failing differently than the README says. Check it and update the README's Status section.",
      ).toBe(403);
      return;
    }

    expect(refusedWith, "The live catalog path is broken. Update the README's Status section.").toBeNull();
    expect(page?.styles.length, "The live catalog came back empty.").toBeGreaterThan(0);
    const first = page?.styles[0];
    expect(typeof first?.id, "Live catalog items no longer have an id.").toBe("string");
    expect(typeof first?.siteName, "Live catalog items no longer have a siteName.").toBe("string");
  });
});
