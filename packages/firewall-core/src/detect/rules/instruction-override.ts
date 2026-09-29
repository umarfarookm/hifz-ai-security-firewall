import type { RegexDetectorRule } from "../types.js";

/**
 * Instruction Override detectors — docs/architecture/LLD.md §3.3.
 */
export const INSTRUCTION_OVERRIDE_RULES: RegexDetectorRule[] = [
  {
    id: "OVR-001",
    attackType: "instruction_override",
    severity: "high",
    confidence: 0.9,
    pattern: /\b(?:ignore|disregard|forget)\s+(?:all\s+|the\s+|your\s+|my\s+)*(?:previous|prior|above|earlier)\s+(?:instructions?|rules?|prompts?|directives?)\b/gi,
    notes: "\"ignore/disregard/forget (all/the/your/my) previous/prior/above/earlier instructions\"",
  },
  {
    id: "OVR-002",
    attackType: "instruction_override",
    severity: "high",
    confidence: 0.8,
    pattern: /\bnew\s+instructions\s*:/gi,
    notes: '"new instructions:" marker introducing replacement instructions',
  },
  {
    id: "OVR-003",
    attackType: "instruction_override",
    severity: "high",
    confidence: 0.85,
    pattern: /\[\s*(?:SYSTEM|ADMIN|DEVELOPER)\s*\]|<<\s*SYS\s*>>|###\s*(?:END OF PROMPT|SYSTEM)\s*###|<\|im_start\|>\s*system|\[\/?INST\]/gi,
    notes: "fake system / end-of-prompt delimiter markers",
  },
  {
    id: "OVR-004",
    attackType: "instruction_override",
    severity: "high",
    confidence: 0.85,
    pattern: /\b(?:override|replace)\s+(?:your|the|all)\s+(?:previous\s+)?instructions\b|\byour\s+new\s+task\s+is\s+to\b/gi,
    notes: '"override/replace your/the instructions", "your new task is to"',
  },
  {
    id: "OVR-005",
    attackType: "instruction_override",
    severity: "high",
    confidence: 0.8,
    pattern:
      /\b(?:ignore|disregard|forget|bypass)\s+(?:all\s+)?your\s+(?!(?:previous|prior|above|earlier)\b)(?:\w+\s+)?(?:guidelines|directions|rules|instructions|restrictions|programming|constraints)\b/gi,
    notes: '"ignore/disregard/bypass your guidelines/directions/rules/restrictions" — possessive form; deliberately excludes previous/prior/above/earlier, which OVR-001 owns (avoids double-counting one phrase)',
  },
  {
    id: "OVR-006",
    attackType: "instruction_override",
    severity: "high",
    confidence: 0.75,
    pattern:
      /\bforget\s+(?:about\s+)?(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:information|context|conversation)\b|\bforget\s+(?:everything|all)\s+(?:that\s+)?(?:i|you|we)(?:'ve|\s+have)?\s+(?:told|said|discussed)\b/gi,
    notes: '"forget about all the previous information", "forget everything I have told you" — context-wipe framing',
  },
];
