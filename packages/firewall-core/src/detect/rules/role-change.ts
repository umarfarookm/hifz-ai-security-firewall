import type { RegexDetectorRule } from "../types.js";

/**
 * Role Change detectors — docs/architecture/LLD.md §3.3.
 */
export const ROLE_CHANGE_RULES: RegexDetectorRule[] = [
  {
    id: "ROL-001",
    attackType: "role_change",
    severity: "high",
    confidence: 0.85,
    // "you are now…" / "act as…" combined with an unrestricted/jailbreak framing
    // within a short distance — a bare "you are now connected to X" must not fire.
    pattern:
      /\b(?:you\s+are\s+now|act\s+as)\b.{0,40}?\b(?:unrestricted|jailbroken|jailbreak|dan|rogue|developer\s+mode|no\s+(?:restrictions|filters|rules|limits)|without\s+(?:restrictions|filters|rules|limits))\b/gis,
    notes: '"you are now…" / "act as…" combined with an unrestricted/DAN/jailbreak framing',
  },
  {
    id: "ROL-002",
    attackType: "role_change",
    severity: "high",
    confidence: 0.8,
    pattern: /\b(?:enable|enter|switch\s+to|activate)\s+(?:developer\s+mode|dan\s+mode|unrestricted\s+mode|god\s+mode|jailbreak\s+mode)\b/gi,
    notes: "explicit request to enable a named unrestricted/developer/DAN mode",
  },
  {
    id: "ROL-003",
    attackType: "role_change",
    severity: "high",
    confidence: 0.75,
    pattern: /\bfrom\s+now\s+on\s*,?\s*(?:respond\s+as|you\s+(?:are|will\s+be))\b/gi,
    notes: '"from now on respond as…" / "from now on you are/will be…"',
  },
];
