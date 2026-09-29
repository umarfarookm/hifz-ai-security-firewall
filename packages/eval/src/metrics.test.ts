import { describe, expect, it } from "vitest";
import { computeMetrics, isCorrect, type CaseResult } from "./metrics.js";

function result(overrides: Partial<CaseResult>): CaseResult {
  return {
    caseId: "case-1",
    category: "instruction_override",
    origin: "own",
    expectedAction: "BLOCK",
    expectedMinBand: "HIGH",
    actualAction: "BLOCK",
    actualBand: "HIGH",
    latencyMs: 10,
    correct: true,
    ...overrides,
  };
}

describe("isCorrect", () => {
  it("an attack case is correct when flagged (any non-ALLOW action)", () => {
    expect(isCorrect("instruction_override", "BLOCK")).toBe(true);
    expect(isCorrect("instruction_override", "REVIEW")).toBe(true);
    expect(isCorrect("instruction_override", "SANITIZE")).toBe(true);
    expect(isCorrect("instruction_override", "ALLOW")).toBe(false);
  });

  it("a legitimate case is correct only when ALLOWed", () => {
    expect(isCorrect("legitimate", "ALLOW")).toBe(true);
    expect(isCorrect("legitimate", "BLOCK")).toBe(false);
    expect(isCorrect("legitimate", "SANITIZE")).toBe(false);
  });
});

describe("computeMetrics", () => {
  it("computes per-category detection rate for attack categories", () => {
    const results = [
      result({ category: "instruction_override", actualAction: "BLOCK" }),
      result({ category: "instruction_override", actualAction: "ALLOW" }),
      result({ category: "instruction_override", actualAction: "REVIEW" }),
    ];
    const summary = computeMetrics("rules_only", "tuning", results);
    const category = summary.categories.find((c) => c.category === "instruction_override")!;
    expect(category.total).toBe(3);
    expect(category.detectionRate).toBeCloseTo(2 / 3);
    expect(category.falsePositiveRate).toBeNull();
  });

  it("computes false-positive rate for the legitimate category", () => {
    const results = [
      result({ category: "legitimate", expectedAction: "ALLOW", expectedMinBand: "LOW", actualAction: "ALLOW", actualBand: "LOW" }),
      result({ category: "legitimate", expectedAction: "ALLOW", expectedMinBand: "LOW", actualAction: "BLOCK", actualBand: "HIGH" }),
    ];
    const summary = computeMetrics("rules_only", "tuning", results);
    const category = summary.categories.find((c) => c.category === "legitimate")!;
    expect(category.falsePositiveRate).toBeCloseTo(0.5);
    expect(category.detectionRate).toBeNull();
  });

  it("computes overall precision and recall across attack + legitimate cases", () => {
    const results = [
      result({ category: "instruction_override", actualAction: "BLOCK" }), // TP
      result({ category: "instruction_override", actualAction: "ALLOW" }), // FN
      result({ category: "legitimate", expectedAction: "ALLOW", expectedMinBand: "LOW", actualAction: "ALLOW", actualBand: "LOW" }), // TN
      result({ category: "legitimate", expectedAction: "ALLOW", expectedMinBand: "LOW", actualAction: "REVIEW", actualBand: "HIGH" }), // FP
    ];
    const summary = computeMetrics("rules_only", "tuning", results);
    // TP=1, FP=1, FN=1 -> precision 1/2, recall 1/2
    expect(summary.precision).toBeCloseTo(0.5);
    expect(summary.recall).toBeCloseTo(0.5);
    expect(summary.overallDetectionRate).toBeCloseTo(0.5); // 1 of 2 attack cases caught
    expect(summary.overallFalsePositiveRate).toBeCloseTo(0.5); // 1 of 2 legitimate cases flagged
  });

  it("computes latency p50/p95 across all cases", () => {
    const results = [10, 20, 30, 40, 50].map((latencyMs) => result({ latencyMs }));
    const summary = computeMetrics("rules_only", "tuning", results);
    expect(summary.latency.n).toBe(5);
    expect(summary.latency.p50).toBe(30);
    expect(summary.latency.p95).toBe(50);
  });

  it("returns zeroed rates for an empty result set instead of dividing by zero", () => {
    const summary = computeMetrics("rules_only", "tuning", []);
    expect(summary.overallDetectionRate).toBe(0);
    expect(summary.overallFalsePositiveRate).toBe(0);
    expect(summary.precision).toBe(0);
    expect(summary.recall).toBe(0);
    expect(summary.latency.n).toBe(0);
  });

  it("tracks bandMet as a secondary severity check alongside the action-based correctness", () => {
    const results = [
      result({ category: "instruction_override", expectedMinBand: "HIGH", actualAction: "BLOCK", actualBand: "CRITICAL" }),
      result({ category: "instruction_override", expectedMinBand: "HIGH", actualAction: "REVIEW", actualBand: "MEDIUM" }),
    ];
    const summary = computeMetrics("rules_only", "tuning", results);
    const category = summary.categories.find((c) => c.category === "instruction_override")!;
    expect(category.detectionRate).toBe(1); // both flagged
    expect(category.bandMet).toBe(1); // only the CRITICAL one met the HIGH bar
  });
});
