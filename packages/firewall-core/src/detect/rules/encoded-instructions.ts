import type { NormalizedContent, Signal } from "../../types.js";

const ENC_001_SEVERITY = "medium" as const;
const ENC_001_CONFIDENCE = 0.7;

/**
 * ENC-001 (docs/architecture/LLD.md §3.3): content the normalizer had to
 * recursively decode (Base64/hex/URL/HTML-entity, min length 16 — see
 * normalize/decode.ts) is worth flagging on its own, before even looking
 * at what the decoded text says. Fires once per decoded layer found.
 *
 * This is deliberately not a RegexDetectorRule — it doesn't pattern-match
 * text, it reacts to the normalizer having found something to decode at
 * all — so it's run separately in detect.ts rather than through the
 * regex-rule loop.
 */
export function detectEncodedInstructions(normalized: NormalizedContent): Signal[] {
  return normalized.decodedLayers.map((layer) => ({
    detectorId: "ENC-001",
    attackType: "encoded_instructions",
    severity: ENC_001_SEVERITY,
    confidence: ENC_001_CONFIDENCE,
    evidence: [layer.sourceSpan],
  }));
}

const ENC_002_SEVERITY = "medium" as const;
const ENC_002_CONFIDENCE = 0.6;

/**
 * ENC-002 (docs/architecture/LLD.md §3.2: "Exceeding either [depth or byte
 * budget] → anomaly `decode_limit` (itself a medium signal)"). Content
 * that forces the normalizer to hit its recursion depth or byte cap while
 * decoding is suspicious on its own — legitimate content has no reason to
 * nest encodings that deep or that large. Fires once per `decode_limit`
 * anomaly the normalizer recorded.
 *
 * No real source span exists for "the decoder gave up" — evidence uses an
 * empty "decoded" span so it still counts toward the scorer's layer
 * adjustment (§3.4), which is the point: this only happens mid-decode.
 */
export function detectDecodeLimitAnomalies(normalized: NormalizedContent): Signal[] {
  return normalized.anomalies
    .filter((anomaly) => anomaly.startsWith("decode_limit"))
    .map((anomaly) => ({
      detectorId: "ENC-002",
      attackType: "encoded_instructions",
      severity: ENC_002_SEVERITY,
      confidence: ENC_002_CONFIDENCE,
      evidence: [{ start: 0, end: 0, excerpt: anomaly, layer: "decoded" as const }],
    }));
}
