import type { ContentType, Span } from "../types.js";

/**
 * Output of stage ① Ingest, before the normalizer (stage ②) gets to it.
 * See docs/architecture/LLD.md §3.1.
 */
export interface IngestResult {
  visibleText: string;
  hiddenSegments: Span[];
}

export type IngestAdapter = (raw: string) => IngestResult;

export type IngestAdapterMap = Partial<Record<ContentType, IngestAdapter>>;
