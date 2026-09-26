import type { NormalizedContent } from "../types.js";

export function contentWithVisibleText(visibleText: string): NormalizedContent {
  return { visibleText, hiddenSegments: [], decodedLayers: [], transforms: [], anomalies: [] };
}
