import type { RegexDetectorRule } from "../types.js";

/**
 * Secret Extraction detectors — docs/architecture/LLD.md §3.3.
 */
export const SECRET_EXTRACTION_RULES: RegexDetectorRule[] = [
  {
    id: "SEC-001",
    attackType: "secret_extraction",
    severity: "high",
    confidence: 0.85,
    pattern:
      /\b(?:reveal|print|repeat|show|output|display)\s+(?:me\s+)?(?:your|the)\s+(?:system\s+prompt|initial\s+(?:instructions|prompt)|hidden\s+rules|instructions)\b/gi,
    notes: '"reveal/print/repeat/show/output/display (your|the) system prompt/instructions/hidden rules"',
  },
  {
    id: "SEC-002",
    attackType: "secret_extraction",
    severity: "high",
    confidence: 0.8,
    pattern: /\b(?:what(?:'s|\s+is|\s+are)\s+your|tell\s+me\s+your)\s+(?:system\s+prompt|initial\s+prompt|instructions|rules|guidelines)\b/gi,
    notes: '"what is/are your system prompt/instructions/rules", "tell me your instructions"',
  },
  {
    id: "SEC-003",
    attackType: "secret_extraction",
    severity: "high",
    confidence: 0.75,
    pattern: /\b(?:translate|encode|summarize|rewrite|convert)\s+your\s+(?:system\s+prompt|instructions|hidden\s+rules|initial\s+prompt)\b/gi,
    notes: "indirect extraction via transformation — \"translate/encode/summarize/rewrite your system prompt\"",
  },
];
