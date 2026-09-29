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
  {
    id: "CRD-004",
    attackType: "credential_theft",
    severity: "high",
    confidence: 0.8,
    pattern:
      /\b(?:send|share|give|provide|hand\s+over|reveal|disclose|paste)\s+(?:me\s+)?(?:with\s+)?(?:the|your)\s+(?:(?:current|secret|admin|root|private|database|db|ssh|login|account)\s+)*(?:pass(?:word|code)s?|api\s*keys?|access\s+tokens?|auth\s+tokens?|secret\s+keys?|private\s+keys?|ssh\s+keys?|session\s+(?:cookie|token)s?|connection\s+strings?|credentials)\b(?!\s+(?:manager|managers|policy|policies|requirements?|reset|strength|length|field|input|hint|rules?|format|guidelines?)\b)|\bi\s+need\s+(?:the|your)\s+(?:(?:current|secret|admin|root|private|database|db|ssh|login|account)\s+)*(?:pass(?:word|code)s?|api\s*keys?|access\s+tokens?|auth\s+tokens?|secret\s+keys?|private\s+keys?|ssh\s+keys?|session\s+(?:cookie|token)s?|connection\s+strings?|credentials)\b(?!\s+(?:manager|managers|policy|policies|requirements?|reset|strength|length|field|input|hint|rules?|format|guidelines?)\b)/gi,
    notes:
      'request for a credential with a determiner — "provide the API key", "give me the database connection string", "send me the private key file", "I need the secret access token"; excludes "password manager/policy/reset…" style benign nouns',
  },
  {
    id: "CRD-005",
    attackType: "credential_theft",
    severity: "high",
    confidence: 0.75,
    pattern:
      /\bwhat(?:'s|\s+is|\s+are)\s+the\s+(?:(?:current|secret|admin|root|master|private|database|db|ssh|wi-?fi|server|system|login|account|user)\s+)+(?:pass(?:word|code)s?|api\s*keys?|access\s+tokens?|auth\s+tokens?|secret\s+keys?|private\s+keys?|ssh\s+keys?|session\s+(?:cookie|token)s?|connection\s+strings?|credentials)\b(?!\s+(?:manager|managers|policy|policies|requirements?|reset|strength|length|field|input|hint|rules?|format|guidelines?)\b)/gi,
    notes: '"what is the admin/root/database password" — direct question about a named system credential',
  },
];
