import { randomUUID } from "node:crypto";
import type { NormalizedContent, Signal } from "../types.js";

export interface SanitizeResult {
  sanitizedText: string;
  /** The random per-request delimiter the sanitized text is wrapped in — callers can reuse it when handing the text to an LLM. */
  delimiter: string;
  redactionCount: number;
}

interface RedactionSpan {
  start: number;
  end: number;
  attackType: string;
}

/** Matches packages/agents/src/investigator/prompt.ts's generateDelimiter — duplicated rather than imported, since firewall-core must not depend on packages/agents (see the repository layout in the README; enforced by eslint.config.js). */
function generateDelimiter(): string {
  return `sanitized-${randomUUID()}`;
}

function mergeOverlapping(spans: RedactionSpan[]): RedactionSpan[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: RedactionSpan[] = [sorted[0]!];
  for (const span of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/**
 * Stage ⑥'s sanitization strategies (docs/architecture/LLD.md §3.7):
 *   1. Remove hidden segments entirely — true by construction, since the
 *      sanitized text is built from `visibleText` alone; hidden segments
 *      were never part of it.
 *   2. Replace flagged spans with `[REMOVED BY HIFZ: <attackType>]`.
 *   3. Wrap the remaining content in a random data delimiter.
 *
 * A signal whose evidence is on a decoded layer doesn't have a span
 * that's meaningful in `visibleText` (its offsets are into the decoded
 * text, a different string) — what *is* meaningful is where the encoded
 * blob itself sat, `DecodedLayer.sourceSpan`. `Signal` doesn't record
 * which specific decoded layer it came from when several exist, so this
 * conservatively redacts every decoded layer's source span whenever any
 * signal has decoded-layer evidence, rather than trying (and risking
 * getting it wrong) to match one to the other. Over-redaction is the
 * safe failure mode for a security firewall; under-redaction isn't.
 */
export function sanitizeContent(normalized: NormalizedContent, signals: Signal[]): SanitizeResult {
  const spans: RedactionSpan[] = [];

  for (const signal of signals) {
    for (const span of signal.evidence) {
      if (span.layer === "visible") {
        spans.push({ start: span.start, end: span.end, attackType: signal.attackType });
      }
    }
  }

  const anyDecodedEvidence = signals.some((s) => s.evidence.some((span) => span.layer === "decoded"));
  if (anyDecodedEvidence) {
    for (const layer of normalized.decodedLayers) {
      if (layer.sourceSpan.layer === "visible") {
        spans.push({ start: layer.sourceSpan.start, end: layer.sourceSpan.end, attackType: "encoded_instructions" });
      }
    }
  }

  const merged = mergeOverlapping(spans.filter((s) => s.start >= 0 && s.end <= normalized.visibleText.length && s.start < s.end));

  let redacted = "";
  let cursor = 0;
  for (const span of merged) {
    redacted += normalized.visibleText.slice(cursor, span.start);
    redacted += `[REMOVED BY HIFZ: ${span.attackType}]`;
    cursor = span.end;
  }
  redacted += normalized.visibleText.slice(cursor);

  const delimiter = generateDelimiter();
  return {
    sanitizedText: `<${delimiter}>${redacted}</${delimiter}>`,
    delimiter,
    redactionCount: merged.length,
  };
}
