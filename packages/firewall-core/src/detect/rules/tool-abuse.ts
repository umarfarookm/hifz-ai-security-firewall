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
    pattern: /\b(?:forward|send|cc|bcc)\s+(?:all|every)\s+(?:the\s+)?(?:messages?|emails?|data|correspondence)\b|\b(?:cc|bcc)\s+everything\s+to\b/gi,
    notes: 'bulk exfiltration framing — "forward all messages to…", "cc everything to…"',
  },
];
