import type { AttackType, Severity } from "../types.js";

/**
 * A single pattern-based detector rule, per docs/architecture/LLD.md §3.3.
 * Rules run against every layer (visible text, each hidden segment, each
 * decoded layer) — see detect.ts.
 */
export interface RegexDetectorRule {
  id: string;
  attackType: AttackType;
  severity: Severity;
  confidence: number;
  /** Must include the "g" flag — detect.ts uses matchAll. */
  pattern: RegExp;
  notes: string;
}
