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
  {
    id: "IND-003",
    attackType: "indirect_prompt_injection",
    severity: "high",
    confidence: 0.7,
    pattern:
      /\b(?:note|message|instructions?|attention|comment)s?\s+(?:\w+\s+)?(?:to|for)\s+(?:the\s+|any\s+|all\s+)?(?:ai|llm|language\s+model)s?\b|\b(?:to|for)\s+(?:any|all|every)\s+(?:ai|llm|language\s+model|large\s+language\s+model|ai\s+(?:assistant|agent))s?\b|\b(?:this|the)\s+(?:comment|text|note|message|section)\s+is\s+(?:for|meant\s+for|intended\s+for)\s+(?:the\s+)?(?:ai|llm|assistant|model)\b|\bai\s+(?:agent|assistant|model)\s*[,:]\s*(?:after|when|before|while|once|if|please|silently|do\s+not|don't|never|always|immediately)\b/gi,
    notes: 'content addressed to the AI reading it — "Note to AI assistant:", "To any language model parsing this page", "This comment is for the AI only", "AI agent: after reading…"',
  },
  {
    id: "IND-004",
    attackType: "indirect_prompt_injection",
    severity: "medium",
    confidence: 0.7,
    pattern:
      /\b(?:add|include|insert|integrate|incorporate|append|inject|embed)\b(?=[^\n]{0,160}(?:\bfake\b|\bfalse\b|\bfabricated\b|\bmisleading\b|\bfraudulent\b|\bpromot\w*|\blottery\b|\bwinnings\b|www\.|https?:\/\/|\bnewsletter\b|\bsubscribe\b|\bbank\s+details\b|\bscam\b|\bclick\s+(?:this|the)\s+link\b|\bspecial\s+offers?\b))[^\n]{0,160}?\b(?:in|into|to)\s+your\s+(?:response|reply|answer|output)\b|\bin\s+your\s+(?:response|reply|answer),?\s+(?=[^\n]{0,160}(?:\bfake\b|\bfalse\b|\bfabricated\b|\bmisleading\b|\bpromot\w*|www\.|https?:\/\/|\bnewsletter\b|\bsubscribe\b|\bbank\s+details\b|\bscam\b))(?:suggest|recommend|promote|mention|include|add|tell|encourage|urge)\b|\b(?:enhance|modify|adjust|alter|update|extend)\s+your\s+(?:response|reply|answer)\s+(?:by|to)\b(?=[^\n]{0,160}(?:\bfake\b|\bfalse\b|\bfabricated\b|\bmisleading\b|\bpromot\w*|www\.|https?:\/\/|\bnewsletter\b|\bsubscribe\b|\bbank\s+details\b|\bscam\b|\bspecial\s+offers?\b))/gi,
    notes: 'BIPIA-style response manipulation — an instruction to change the assistant\'s reply, paired with a promotional/fraud/misinformation payload marker. The payload-marker requirement is deliberate: "please include the invoice number in your reply" is ordinary and must not fire',
  },
];
