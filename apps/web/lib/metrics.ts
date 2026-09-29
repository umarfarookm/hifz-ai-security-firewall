import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const BANDS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const ACTIONS = ["ALLOW", "SANITIZE", "REVIEW", "BLOCK"] as const;
const MODES = ["rules_only", "rules_llm"] as const;
const SPLITS = ["heldout", "tuning"] as const;

// Mirrors the EvalSummary that packages/eval writes to eval_runs.summary. Validated on read — the
// column is free-form jsonb, so a stale or hand-edited row must not crash the page.
const evalSummarySchema = z.object({
  mode: z.enum(MODES),
  split: z.enum(SPLITS),
  totalCases: z.number(),
  categories: z.array(
    z.object({
      category: z.string(),
      total: z.number(),
      detectionRate: z.number().nullable(),
      falsePositiveRate: z.number().nullable(),
    }),
  ),
  overallDetectionRate: z.number(),
  overallFalsePositiveRate: z.number(),
  precision: z.number(),
  recall: z.number(),
  latency: z.object({ n: z.number(), p50: z.number(), p95: z.number(), mean: z.number() }),
  // Absent on runs recorded before the eval tracked it.
  llmStatusCounts: z.record(z.number()).optional(),
});

export type EvalSummaryView = z.infer<typeof evalSummarySchema>;

export interface EvalRunView {
  runId: string;
  gitSha: string | null;
  modelTag: string | null;
  finishedAt: string | null;
  summary: EvalSummaryView;
}

export interface MetricsBody {
  counters: {
    totalInspections: number;
    byBand: Record<(typeof BANDS)[number], number>;
    byAction: Record<(typeof ACTIONS)[number], number>;
  };
  /** Latest run per split and mode; null when that combination has never been run. */
  latestEval: Record<(typeof SPLITS)[number], Record<(typeof MODES)[number], EvalRunView | null>>;
}

async function countInspections(client: SupabaseClient, column?: "final_band" | "action", value?: string): Promise<number> {
  let query = client.from("inspections").select("id", { count: "exact", head: true });
  if (column && value) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw new Error(`failed to count inspections: ${error.message}`);
  return count ?? 0;
}

async function latestEvalRun(client: SupabaseClient, split: string, mode: string): Promise<EvalRunView | null> {
  const { data, error } = await client
    .from("eval_runs")
    .select("id, git_sha, model_tag, finished_at, summary")
    .eq("split", split)
    .eq("mode", mode)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`failed to read eval_runs: ${error.message}`);
  const row = data?.[0];
  if (!row) return null;
  const parsed = evalSummarySchema.safeParse(row.summary);
  if (!parsed.success) return null;
  return {
    runId: row.id as string,
    gitSha: (row.git_sha as string | null) ?? null,
    modelTag: (row.model_tag as string | null) ?? null,
    finishedAt: (row.finished_at as string | null) ?? null,
    summary: parsed.data,
  };
}

/** GET /api/v1/metrics — live counters plus the latest eval run per split and mode (docs/architecture/LLD.md §4). */
export async function getMetrics(client: SupabaseClient): Promise<MetricsBody> {
  const [total, bandCounts, actionCounts, evalRuns] = await Promise.all([
    countInspections(client),
    Promise.all(BANDS.map((b) => countInspections(client, "final_band", b))),
    Promise.all(ACTIONS.map((a) => countInspections(client, "action", a))),
    Promise.all(SPLITS.flatMap((split) => MODES.map(async (mode) => [split, mode, await latestEvalRun(client, split, mode)] as const))),
  ]);

  const latestEval = {
    heldout: { rules_only: null, rules_llm: null },
    tuning: { rules_only: null, rules_llm: null },
  } as MetricsBody["latestEval"];
  for (const [split, mode, run] of evalRuns) latestEval[split][mode] = run;

  return {
    counters: {
      totalInspections: total,
      byBand: Object.fromEntries(BANDS.map((b, i) => [b, bandCounts[i]!])) as MetricsBody["counters"]["byBand"],
      byAction: Object.fromEntries(ACTIONS.map((a, i) => [a, actionCounts[i]!])) as MetricsBody["counters"]["byAction"],
    },
    latestEval,
  };
}
