import type { IngestAdapter } from "./types.js";

/** Plain text has no hidden-text concept — what you see is what's scanned. */
export const ingestText: IngestAdapter = (raw) => ({
  visibleText: raw,
  hiddenSegments: [],
});
