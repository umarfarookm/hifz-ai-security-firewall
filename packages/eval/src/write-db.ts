import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseResult, EvalSummary } from "./metrics.js";

/**
 * Persists one eval run per docs/architecture/LLD.md §5's eval_runs /
 * eval_results tables — GET /metrics (task 3.3) reads the latest run's
 * `summary` for the dashboard's "latest held-out eval summary".
 */
export async function writeEvalRunToDb(
  client: SupabaseClient,
  params: { gitSha: string; modelTag: string | null; startedAt: string; finishedAt: string; summary: EvalSummary; results: CaseResult[] },
): Promise<string> {
  const { data: run, error: runError } = await client
    .from("eval_runs")
    .insert({
      git_sha: params.gitSha,
      mode: params.summary.mode,
      split: params.summary.split,
      model_tag: params.modelTag,
      started_at: params.startedAt,
      finished_at: params.finishedAt,
      summary: params.summary,
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`failed to write eval_runs row: ${runError?.message ?? "no row returned"}`);
  }

  const rows = params.results.map((r) => ({
    run_id: run.id as string,
    case_id: r.caseId,
    category: r.category,
    expected_action: r.expectedAction,
    actual_action: r.actualAction,
    expected_band: r.expectedMinBand,
    actual_band: r.actualBand,
    latency_ms: Math.round(r.latencyMs),
    correct: r.correct,
  }));

  const { error: resultsError } = await client.from("eval_results").insert(rows);
  if (resultsError) {
    // Don't leave a summary-only run behind — GET /metrics reads the latest eval_runs row.
    await client.from("eval_runs").delete().eq("id", run.id);
    throw new Error(`failed to write eval_results rows (run rolled back): ${resultsError.message}`);
  }

  return run.id as string;
}
