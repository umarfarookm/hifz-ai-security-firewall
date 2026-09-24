import type { Span } from "../types.js";

const EXCERPT_MAX_LENGTH = 200;

/**
 * Finds where a piece of extracted text sits in the original raw input, so
 * evidence spans point back to something a reviewer can actually see.
 * Adapters call this with a monotonically increasing `fromIndex` so repeated
 * substrings (e.g. the same alt text twice) resolve to distinct occurrences
 * instead of all pointing at the first match.
 */
export function locateSpan(
  raw: string,
  needle: string,
  layer: Span["layer"],
  fromIndex = 0,
): { span: Span; nextIndex: number } {
  if (needle.length === 0) {
    return { span: { start: fromIndex, end: fromIndex, excerpt: "", layer }, nextIndex: fromIndex };
  }

  const start = raw.indexOf(needle, fromIndex);
  const excerpt = needle.length > EXCERPT_MAX_LENGTH ? needle.slice(0, EXCERPT_MAX_LENGTH) : needle;

  if (start === -1) {
    // The extracted text doesn't appear verbatim in the raw source (e.g. it
    // was decoded or reconstructed). Offsets are unknown, not wrong.
    return { span: { start: -1, end: -1, excerpt, layer }, nextIndex: fromIndex };
  }

  const end = start + needle.length;
  return { span: { start, end, excerpt, layer }, nextIndex: end };
}
