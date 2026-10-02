import { createHash } from "node:crypto";

export type SplitAssignment = "tuning" | "heldout";

const TUNING_PERCENTAGE = 60;

/**
 * Deterministic hash of caseId → 60% tuning / 40% held-out
 * (docs/architecture/LLD.md §7). Deterministic means the split never
 * changes just because cases were added or the file order changed — a
 * case's assignment depends only on its own id. Held-out cases are never
 * used to tune rules or thresholds (see the evaluation architecture in docs/architecture/HLD.md §12).
 */
export function computeSplit(caseId: string): SplitAssignment {
  const hash = createHash("sha256").update(caseId).digest("hex");
  const bucket = Number.parseInt(hash.slice(0, 8), 16) % 100;
  return bucket < TUNING_PERCENTAGE ? "tuning" : "heldout";
}

export function buildSplitMap(caseIds: string[]): Record<string, SplitAssignment> {
  const sorted = [...caseIds].sort();
  const map: Record<string, SplitAssignment> = {};
  for (const id of sorted) map[id] = computeSplit(id);
  return map;
}
