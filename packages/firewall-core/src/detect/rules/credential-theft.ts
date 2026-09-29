import type { RegexDetectorRule } from "../types.js";

/**
 * Credential Theft detectors — docs/architecture/LLD.md §3.3. Content-level,
 * primary line of defense; Action Guard G4 (§3.9) scans outbound tool args
 * as the second line.
 */
export const CREDENTIAL_THEFT_RULES: RegexDetectorRule[] = [
  {
    id: "CRD-001",
    attackType: "credential_theft",
    severity: "high",
    confidence: 0.85,
    pattern: /\b(?:send|share|give|provide|enter)\s+(?:me\s+)?(?:your\s+)?(?:password|api\s*key|access\s+token|auth\s+token|secret\s+key)\b/gi,
    notes: '"send/share/give/provide/enter (me/your) password/API key/access token/secret key"',
  },
  {
    id: "CRD-002",
    attackType: "credential_theft",
    severity: "high",
    confidence: 0.8,
    pattern: /\bverify\s+your\s+(?:credentials|account|identity|password)\b|\bconfirm\s+your\s+(?:password|credentials|identity)\b/gi,
    notes: '"verify your credentials/account/identity", "confirm your password" — phishing-style credential request',
  },
  {
    id: "CRD-003",
    attackType: "credential_theft",
    severity: "high",
    confidence: 0.75,
    pattern: /\b(?:what(?:'s|\s+is)\s+your|(?:can\s+you\s+)?tell\s+me\s+your)\s+(?:password|api\s*key|access\s+token|secret\s+key)\b/gi,
    notes: '"what is your password/API key", "tell me your access token" — direct question form',
  },
];
