import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getMetrics } from "./metrics.js";

type Filters = Record<string, string>;
interface FakeData {
  counts: (table: string, filters: Filters) => number;
  evalRuns: (filters: Filters) => Array<Record<string, unknown>>;
  failCounts?: boolean;
}

/** Just enough of the supabase-js query builder for metrics.ts: select/eq/order/limit, awaitable. */
function fakeClient(data: FakeData): SupabaseClient {
  return {
    from(table: string) {
      const filters: Filters = {};
      let head = false;
      const builder = {
        select(_cols: string, opts?: { head?: boolean }) {
          head = opts?.head ?? false;
          return builder;
        },
        eq(col: string, val: string) {
          filters[col] = val;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        then(resolve: (v: unknown) => unknown) {
          if (head) {
            return resolve(data.failCounts ? { count: null, error: { message: "boom" } } : { count: data.counts(table, filters), error: null });
          }
          return resolve({ data: data.evalRuns(filters), error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const summary = (mode: string, split: string) => ({
  mode,
  split,
  totalCases: 10,
  categories: [{ category: "tool_abuse", total: 4, detectionRate: 0.75, falsePositiveRate: null }],
  overallDetectionRate: 0.75,
  overallFalsePositiveRate: 0,
  precision: 1,
  recall: 0.75,
  latency: { n: 10, p50: 1, p95: 2, mean: 1.5 },
});

describe("getMetrics", () => {
  it("returns counters and the latest run per split and mode, null where none exists", async () => {
    const metrics = await getMetrics(
      fakeClient({
        counts: (_t, f) => (f.final_band === "HIGH" ? 3 : f.action === "BLOCK" ? 2 : f.final_band || f.action ? 0 : 7),
        evalRuns: (f) =>
          f.split === "heldout" && f.mode === "rules_only"
            ? [{ id: "run-1", git_sha: "abc123", model_tag: null, finished_at: "2026-10-01T00:00:00Z", summary: summary("rules_only", "heldout") }]
            : [],
      }),
    );

    expect(metrics.counters.totalInspections).toBe(7);
    expect(metrics.counters.byBand.HIGH).toBe(3);
    expect(metrics.counters.byAction.BLOCK).toBe(2);
    expect(metrics.latestEval.heldout.rules_only?.runId).toBe("run-1");
    expect(metrics.latestEval.heldout.rules_only?.summary.overallDetectionRate).toBe(0.75);
    expect(metrics.latestEval.heldout.rules_llm).toBeNull();
    expect(metrics.latestEval.tuning.rules_only).toBeNull();
  });

  it("treats a run whose summary fails validation as absent instead of throwing", async () => {
    const metrics = await getMetrics(
      fakeClient({
        counts: () => 0,
        evalRuns: () => [{ id: "bad", git_sha: null, model_tag: null, finished_at: null, summary: { nonsense: true } }],
      }),
    );
    expect(metrics.latestEval.heldout.rules_only).toBeNull();
  });

  it("surfaces a database error rather than reporting zeros", async () => {
    await expect(getMetrics(fakeClient({ counts: () => 0, evalRuns: () => [], failCounts: true }))).rejects.toThrow(/failed to count inspections/);
  });
});
