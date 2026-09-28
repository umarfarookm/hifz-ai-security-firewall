import type { IngestResult } from "../ingest/types.js";
import type { DecodedLayer, NormalizedContent, Span } from "../types.js";
import type { DecodeBudget } from "./decode.js";
import { recursivelyDecode } from "./decode.js";
import { foldForMatching } from "./homoglyph.js";
import { stripZeroWidthAndBidi, toNfkc } from "./unicode.js";

/**
 * Stage ② Normalize (docs/architecture/LLD.md §3.2). Takes stage ①'s
 * output (visible text + hidden segments) and applies, in order:
 *   1. NFKC normalization
 *   2. Zero-width / bidi-control stripping
 *   3–4. Homoglyph + whitespace/case folding — not persisted; used here
 *        only to flag the `mixed_script` anomaly. Detectors (1.8) call
 *        homoglyph.ts's foldHomoglyphsOnly directly on each layer at match
 *        time instead (offset-preserving, unlike foldForMatching below).
 *   5. Recursive decoding of Base64/hex/URL/HTML-entity runs, applied to
 *      both the visible text and every hidden segment, sharing one
 *      depth/byte budget across all of it.
 */
export function normalize(ingestResult: IngestResult): NormalizedContent {
  const transforms: string[] = ["nfkc"];
  const anomalies: string[] = [];

  const { text: visibleText, strippedCount: visibleStrippedCount } = stripZeroWidthAndBidi(toNfkc(ingestResult.visibleText));
  if (visibleStrippedCount > 0) transforms.push(`strip_zero_width:${visibleStrippedCount}`);

  const { homoglyphCount } = foldForMatching(visibleText);
  if (homoglyphCount > 0) anomalies.push(`mixed_script:${homoglyphCount}`);

  const hiddenSegments: Span[] = ingestResult.hiddenSegments.map((span) => ({
    ...span,
    excerpt: stripZeroWidthAndBidi(toNfkc(span.excerpt)).text,
  }));

  const budget: DecodeBudget = { bytesUsed: 0 };
  const decodedLayers: DecodedLayer[] = [];

  const visibleDecode = recursivelyDecode(visibleText, "visible", budget);
  decodedLayers.push(...visibleDecode.layers);
  anomalies.push(...visibleDecode.anomalies);

  for (const segment of hiddenSegments) {
    const segmentDecode = recursivelyDecode(segment.excerpt, "hidden", budget);
    decodedLayers.push(...segmentDecode.layers);
    anomalies.push(...segmentDecode.anomalies);
  }

  if (decodedLayers.length > 0) transforms.push(`recursive_decode:${decodedLayers.length}`);

  return { visibleText, hiddenSegments, decodedLayers, transforms, anomalies };
}
