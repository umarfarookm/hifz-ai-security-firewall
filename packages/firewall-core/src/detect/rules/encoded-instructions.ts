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
