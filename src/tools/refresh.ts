/**
 * `refero_refresh` — walk every page of /api/styles?page=N until exhausted,
 * dedupe by id, and overwrite catalog.json.
 *
 * Author: Nate Davidovich (Lorecraft LLC)
 */
import { readCatalog, writeCatalog } from "../cache.js";
import {
  OFFICIAL_MCP_HINT,
  ReferoUnavailableError,
  describeFailure,
  fetchFullCatalog,
} from "./shared.js";

export interface RefreshResult {
  totalStyles: number;
  pagesFetched: number;
  durationMs: number;
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function handleRefresh(_args: Record<string, unknown> = {}): Promise<RefreshResult> {
  const started = Date.now();
  let fetched: Awaited<ReturnType<typeof fetchFullCatalog>>;
  try {
    fetched = await fetchFullCatalog();
  } catch (err) {
    const cached = await readCatalog();
    const kept = cached?.styles?.length
      ? `Your local catalog was left as it is (${cached.styles.length} styles from ${new Date(cached.updatedAt).toISOString().slice(0, 10)}).`
      : "There is no local catalog yet.";
    throw new ReferoUnavailableError(
      `Could not refresh the catalog. ${describeFailure(err)}. ${kept} ${OFFICIAL_MCP_HINT}`,
    );
  }
  const { styles, pagesFetched } = fetched;
  await writeCatalog(styles);
  return {
    totalStyles: styles.length,
    pagesFetched,
    durationMs: Date.now() - started,
  };
}
