import type { RegexDetectorRule } from "../types.js";

/**
 * Indirect Injection detectors — docs/architecture/LLD.md §3.3. IND-001 is
 * the pattern-based half ("imperatives addressed to an AI/assistant inside
 * untrusted sources"). The other half — "any detector firing on a hidden
 * segment" — isn't a phrase pattern at all; it's IND-002, a structural rule
 * implemented directly in detect.ts (see detectIndirectInjectionFromHiddenSignals)
 * since it depends on what every *other* detector already found, not on
 * matching text of its own.
 */
export const INDIRECT_INJECTION_RULES: RegexDetectorRule[] = [
  {
    id: "IND-001",
    attackType: "indirect_prompt_injection",
    severity: "high",
    confidence: 0.7,
    pattern: /\b(?:ai|assistant|bot|chatbot)\s*[,:]\s*(?:please\s+)?(?:ignore|disregard|forget|do|execute|run|send|forward|reveal|act|comply)\b/gi,
    notes: 'an imperative addressed directly to "AI"/"assistant"/"bot"/"chatbot" — the address form untrusted content uses to talk past the user to the agent reading it',
  },
];
