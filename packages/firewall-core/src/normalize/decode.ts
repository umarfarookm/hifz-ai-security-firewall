import type { DecodedLayer, Span } from "../types.js";
import { stripZeroWidthAndBidi, toNfkc } from "./unicode.js";

const MIN_ENCODED_LENGTH = 16;
export const MAX_DECODE_DEPTH = 3;
export const MAX_DECODED_BYTES = 50 * 1024;
const PRINTABLE_RATIO_THRESHOLD = 0.85;
const EXCERPT_MAX_LENGTH = 200;

export interface DecodeBudget {
  bytesUsed: number;
}

export interface DecodeOutcome {
  layers: DecodedLayer[];
  anomalies: string[];
}

interface Candidate {
  encoding: DecodedLayer["encoding"];
  match: string;
  start: number;
  end: number;
}

// Checked in this order — url and html_entity are unambiguous (%, &...;),
// so they're claimed first; hex and base64 share an alphabet (hex is a
// subset of base64's), so hex goes before the more permissive base64 to
// avoid mis-classifying a hex run as base64.
const PATTERNS: Array<{ encoding: DecodedLayer["encoding"]; regex: RegExp }> = [
  { encoding: "url", regex: /(?:%[0-9A-Fa-f]{2}){6,}/g },
  { encoding: "html_entity", regex: /(?:&#\d{2,7};|&#x[0-9A-Fa-f]{2,6};){3,}/g },
  { encoding: "hex", regex: /(?:[0-9a-fA-F]{2}){8,}/g },
  { encoding: "base64", regex: /[A-Za-z0-9+/]{16,}={0,2}/g },
];

const BASE64_SHAPE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function findCandidates(text: string): Candidate[] {
  const claimed: Array<[number, number]> = [];
  const candidates: Candidate[] = [];

  for (const { encoding, regex } of PATTERNS) {
    for (const match of text.matchAll(regex)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (end - start < MIN_ENCODED_LENGTH) continue;
      if (claimed.some(([claimedStart, claimedEnd]) => start < claimedEnd && end > claimedStart)) continue;
      candidates.push({ encoding, match: match[0], start, end });
      claimed.push([start, end]);
    }
  }

  return candidates.sort((a, b) => a.start - b.start);
}

function decodeHtmlEntities(raw: string): string {
  return raw.replace(/&#(\d+);|&#x([0-9A-Fa-f]+);|&(\w+);/g, (whole, dec: string, hex: string, named: string) => {
    if (dec) return String.fromCodePoint(Number.parseInt(dec, 10));
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    if (named && named in NAMED_HTML_ENTITIES) return NAMED_HTML_ENTITIES[named]!;
    return whole;
  });
}

function tryDecode(encoding: DecodedLayer["encoding"], raw: string): string | null {
  try {
    switch (encoding) {
      case "base64":
        return BASE64_SHAPE.test(raw) ? Buffer.from(raw, "base64").toString("utf8") : null;
      case "hex":
        return Buffer.from(raw, "hex").toString("utf8");
      case "url":
        return decodeURIComponent(raw);
      case "html_entity":
        return decodeHtmlEntities(raw);
    }
  } catch {
    return null;
  }
}

function isMostlyPrintable(text: string): boolean {
  if (text.length === 0) return false;
  let printable = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || ch === "\t" || ch === "\n" || ch === "\r") printable++;
  }
  return printable / text.length >= PRINTABLE_RATIO_THRESHOLD;
}

function truncate(text: string): string {
  return text.length > EXCERPT_MAX_LENGTH ? text.slice(0, EXCERPT_MAX_LENGTH) : text;
}

/**
 * Stage ②, step 5 of docs/architecture/LLD.md §3.2: find and decode
 * Base64/hex/URL/HTML-entity runs, recursively re-scanning what comes out,
 * up to MAX_DECODE_DEPTH levels deep and MAX_DECODED_BYTES total (shared
 * across every call that passes the same `budget` object — see
 * normalize.ts, which shares one budget across visibleText and every
 * hidden segment). Exceeding either limit stops that branch and records a
 * `decode_limit` anomaly rather than continuing unbounded — this is the
 * defence against a decode bomb (LLD §11).
 */
export function recursivelyDecode(text: string, sourceLayer: Span["layer"], budget: DecodeBudget, depth = 1): DecodeOutcome {
  const layers: DecodedLayer[] = [];
  const anomalies: string[] = [];

  if (depth > MAX_DECODE_DEPTH) {
    anomalies.push("decode_limit:max_depth");
    return { layers, anomalies };
  }

  for (const candidate of findCandidates(text)) {
    const decoded = tryDecode(candidate.encoding, candidate.match);
    if (decoded === null || !isMostlyPrintable(decoded)) continue;

    const decodedByteLength = Buffer.byteLength(decoded, "utf8");
    if (budget.bytesUsed + decodedByteLength > MAX_DECODED_BYTES) {
      anomalies.push("decode_limit:max_bytes");
      continue;
    }
    budget.bytesUsed += decodedByteLength;

    const cleanedDecoded = stripZeroWidthAndBidi(toNfkc(decoded)).text;

    layers.push({
      encoding: candidate.encoding,
      depth,
      text: cleanedDecoded,
      sourceSpan: { start: candidate.start, end: candidate.end, excerpt: truncate(candidate.match), layer: sourceLayer },
    });

    const nested = recursivelyDecode(cleanedDecoded, "decoded", budget, depth + 1);
    layers.push(...nested.layers);
    anomalies.push(...nested.anomalies);
  }

  return { layers, anomalies };
}
