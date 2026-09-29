import type { ContentType, Span } from "../types.js";

/**
 * Output of stage ① Ingest, before the normalizer (stage ②) gets to it.
 * See docs/architecture/LLD.md §3.1.
 */
export interface IngestResult {
  visibleText: string;
  hiddenSegments: Span[];
}

/** What each content type's own module exports — every adapter but pdf is synchronous. */
export type IngestAdapter = (raw: string) => IngestResult;

/**
 * What `ingestAdapters` (the polymorphic, content-type-keyed map) holds.
 * Wider than `IngestAdapter` so it also accommodates pdf's real async parse
 * (pdf-parse) — every synchronous adapter is still assignable here, but a
 * caller going through the map must always await the result, even for a
 * content type that happens to resolve synchronously.
 */
export type MapIngestAdapter = (raw: string) => IngestResult | Promise<IngestResult>;

export type IngestAdapterMap = Partial<Record<ContentType, MapIngestAdapter>>;
