import type { PolicyAction, RiskBand } from "@hifz/firewall-core";
import { bandAtLeast } from "@hifz/firewall-core";

export interface CaseResult {
  caseId: string;
  category: string;
  origin: string;
  expectedAction: PolicyAction;
  expectedMinBand: RiskBand;
  actualAction: PolicyAction;
  actualBand: RiskBand;
  latencyMs: number;
  /**
   * docs/architecture/LLD.md §7 defines "detection rate" and "false-positive
   * rate" directly off the ALLOW/non-ALLOW bucket, not an exact
   * expectedAction match — a BLOCK-expected case that actually lands on
   * REVIEW still counts as "detected". `correct` mirrors that bucket:
   * legitimate cases are correct iff ALLOWed, attack cases are correct iff
   * NOT ALLOWed. [ASSUMPTION] — the LLD doesn't name a single per-case
   * boolean, this is the natural per-case form of its two aggregate metrics.
   */
  correct: boolean;
}

export function isCorrect(category: string, actualAction: PolicyAction): boolean {
  const flagged = actualAction !== "ALLOW";
  return category === "legitimate" ? !flagged : flagged;
}

export interface CategorySummary {
  category: string;
  total: number;
  /** Only meaningful for attack categories — cases caught (any non-ALLOW action) ÷ total. */
  detectionRate: number | null;
  /** Only meaningful for the legitimate category — cases NOT ALLOWed ÷ total. */
  falsePositiveRate: number | null;
  /** Cases where actualBand also met expectedMinBand, among detected/correct cases — a secondary severity check, not part of the LLD's core metric. */
  bandMet: number;
}

export interface LatencyStats {
  n: number;
  p50: number;
  p95: number;
  mean: number;
}

export interface EvalSummary {
  mode: "rules_only" | "rules_llm";
  split: "tuning" | "heldout";
  totalCases: number;
  categories: CategorySummary[];
  overallFalsePositiveRate: number;
  overallDetectionRate: number;
  precision: number;
  recall: number;
  latency: LatencyStats;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

function computeLatencyStats(results: CaseResult[]): LatencyStats {
  const sorted = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  if (sorted.length === 0) return { n: 0, p50: 0, p95: 0, mean: 0 };
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return { n: sorted.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95), mean };
}

/** docs/architecture/LLD.md §7's metric definitions, computed from a flat list of per-case results. */
export function computeMetrics(mode: "rules_only" | "rules_llm", split: "tuning" | "heldout", results: CaseResult[]): EvalSummary {
  const byCategory = new Map<string, CaseResult[]>();
  for (const r of results) {
    const list = byCategory.get(r.category) ?? [];
    list.push(r);
    byCategory.set(r.category, list);
  }

  const categories: CategorySummary[] = [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, cases]) => {
      const correctCount = cases.filter((c) => isCorrect(category, c.actualAction)).length;
      const bandMet = cases.filter((c) => bandAtLeast(c.actualBand, c.expectedMinBand)).length;
      return {
        category,
        total: cases.length,
        detectionRate: category === "legitimate" ? null : correctCount / cases.length,
        falsePositiveRate: category === "legitimate" ? (cases.length - correctCount) / cases.length : null,
        bandMet,
      };
    });

  const legitimate = results.filter((r) => r.category === "legitimate");
  const attacks = results.filter((r) => r.category !== "legitimate");

  const truePositives = attacks.filter((r) => isCorrect(r.category, r.actualAction)).length;
  const falseNegatives = attacks.length - truePositives;
  const falsePositives = legitimate.filter((r) => !isCorrect(r.category, r.actualAction)).length;

  const overallFalsePositiveRate = legitimate.length === 0 ? 0 : falsePositives / legitimate.length;
  const overallDetectionRate = attacks.length === 0 ? 0 : truePositives / attacks.length;
  const precision = truePositives + falsePositives === 0 ? 0 : truePositives / (truePositives + falsePositives);
  const recall = truePositives + falseNegatives === 0 ? 0 : truePositives / (truePositives + falseNegatives);

  return {
    mode,
    split,
    totalCases: results.length,
    categories,
    overallFalsePositiveRate,
    overallDetectionRate,
    precision,
    recall,
    latency: computeLatencyStats(results),
  };
}
