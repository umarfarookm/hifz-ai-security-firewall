import type { Severity } from "../types.js";

const SEVERITY_ORDER: Severity[] = ["low", "medium", "high", "critical"];

/**
 * "Encoded Instructions | ENC-001 + any detector firing on a decoded layer
 * → severity raised one level" (docs/architecture/LLD.md §3.3). Finding an
 * instruction-override or role-change pattern inside content that had to
 * be decoded first is more suspicious than finding it in plain sight —
 * capped at critical, never wraps around.
 */
export function escalateSeverity(severity: Severity): Severity {
  const index = SEVERITY_ORDER.indexOf(severity);
  return SEVERITY_ORDER[Math.min(index + 1, SEVERITY_ORDER.length - 1)]!;
}
