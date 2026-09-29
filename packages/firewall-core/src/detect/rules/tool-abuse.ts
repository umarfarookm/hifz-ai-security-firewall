import type { RegexDetectorRule } from "../types.js";

/**
 * Tool Abuse detectors — docs/architecture/LLD.md §3.3. Content-level,
 * primary line of defense; the Action Guard (§3.9) is the second line for
 * whatever a tool-calling agent actually attempts.
 */
export const TOOL_ABUSE_RULES: RegexDetectorRule[] = [
  {
    id: "TOL-001",
    attackType: "tool_abuse",
    severity: "high",
    confidence: 0.75,
    pattern: /\b(?:send|forward)\s+(?:an?\s+|this\s+|that\s+|the\s+)?(?:email|message)s?\s+to\b/gi,
    notes: '"send/forward an email/message to…" — instructs a tool-calling agent to take an action',
  },
  {
    id: "TOL-002",
    attackType: "tool_abuse",
    severity: "high",
    confidence: 0.8,
    pattern: /\b(?:call|invoke|execute|run)\s+(?:the\s+)?(?:[\w-]+\s+)?(?:function|tool|api|command)\b/gi,
    notes: '"call/invoke/execute/run the (named) function/tool/api/command"',
  },
  {
    id: "TOL-003",
    attackType: "tool_abuse",
    severity: "high",
    confidence: 0.85,
    pattern: /\b(?:forward|send|cc|bcc)\s+(?:all|every)\s+(?:the\s+)?(?:incoming\s+|new\s+|future\s+|received\s+)?(?:messages?|emails?|data|correspondence)\b|\b(?:cc|bcc)\s+everything\s+to\b/gi,
    notes: 'bulk exfiltration framing — "forward all (incoming) messages to…", "cc everything to…"',
  },
  {
    id: "TOL-004",
    attackType: "tool_abuse",
    severity: "high",
    confidence: 0.75,
    pattern:
      /\buse\s+(?:your|the)\s+(?:[\w-]+\s+)?tools?\s+to\s+(?:transfer|send|forward|delete|wire|pay|charge|open|submit|post|upload|exfiltrate|email|download)\b/gi,
    notes: '"use your tools/the browser tool to transfer/send/open/submit…" — tool invocation paired with a consequential action verb',
  },
  {
    id: "TOL-005",
    attackType: "tool_abuse",
    severity: "high",
    confidence: 0.8,
    pattern: /\b(?:transfer|wire)\s+(?:[$€£]\s?)?\d[\d,.]*\s*(?:usd|dollars|eur|euros|gbp|inr)?\s+to\b/gi,
    notes: '"transfer $10,000 to account…" — instructs a payment action',
  },
  {
    id: "TOL-006",
    attackType: "tool_abuse",
    severity: "high",
    confidence: 0.75,
    pattern:
      /\bcharge\s+(?:the\s+)?(?:customer|user|client|their|his|her)(?:'s|’s)?\s+(?:credit\s+)?(?:card|account)\b|\b(?:trigger|invoke|hit)\s+the\s+(?:[\w-]+\s+)?(?:api|endpoint|webhook)\s+to\s+(?:charge|refund|transfer|pay|delete)\b/gi,
    notes: '"charge the customer\'s card", "trigger the payment API to charge…" — payment action framing',
  },
  {
    id: "TOL-007",
    attackType: "tool_abuse",
    severity: "high",
    confidence: 0.7,
    pattern: /\b(?:call|invoke|execute|run)\s+[a-z]+_[a-z_]+\s+(?:on|for|with|to)\s+(?:every|all|each)\b/gi,
    notes: '"call send_sms on every phone number" — snake_case tool name applied in bulk',
  },
];
