import type { IngestAdapter } from "./types.js";

/**
 * Walks every string value in a JSON document and concatenates them for
 * scanning. JSON has no hidden-text concept — see docs/architecture/LLD.md
 * §3.1 (the json row has no hidden-text sources listed).
 *
 * Known simplification: LLD §3.1 calls for the JSON path to be recorded
 * per segment for evidence purposes. `Span` doesn't carry a path field yet,
 * so for now every string value is joined into one visibleText blob and
 * evidence offsets point into that blob, not the original document
 * structure. Revisit if evidence needs to reference the source path.
 */
export const ingestJson: IngestAdapter = (raw) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON is still worth scanning — fall back to the raw text
    // rather than dropping the inspection.
    return { visibleText: raw, hiddenSegments: [] };
  }

  const strings: string[] = [];
  collectStrings(parsed, strings);

  return { visibleText: strings.join("\n"), hiddenSegments: [] };
};

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
}
