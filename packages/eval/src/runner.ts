import { execSync } from "node:child_process";
import { loadEnv, type Env } from "@hifz/config";
import { createModelGateway } from "@hifz/agents";
import { loadDataset } from "./loader.js";
import { computeSplit, type SplitAssignment } from "./split.js";
import { runCase, type EvalMode } from "./run-case.js";
import { computeMetrics, isCorrect, type CaseResult, type EvalSummary } from "./metrics.js";
import { writeJsonReport, type EvalReport } from "./report.js";
import { createServerSupabaseClient } from "./supabase-client.js";
import { writeEvalRunToDb } from "./write-db.js";
import { ThrottledGateway } from "./throttled-gateway.js";
import type { EvalCase } from "./types.js";

export interface RunEvalOptions {
  mode: EvalMode;
  split: SplitAssignment;
  datasetsDir: string;
  reportsDir: string;
  /** Skip the Supabase write entirely — useful for a local run with no DB access configured. Default: attempt it, warn (not throw) on failure. */
  skipDb?: boolean;
  /** Injected for tests; defaults to process.env via @hifz/config. */
  env?: Env;
  /** Minimum gap between model requests in rules_llm mode; keeps a free-tier key under its requests-per-minute cap. */
  llmMinIntervalMs?: number;
}

export interface RunEvalResult {
  summary: EvalSummary;
  results: CaseResult[];
  reportPath: string;
  /** Cases that threw (e.g. no ingest adapter, unparseable PDF). Excluded from the metrics, not silently dropped. */
  caseErrors: Array<{ caseId: string; message: string }>;
  /** Model-request failure message → count (rules_llm only). Explains any "unavailable" investigator status. */
  llmFailures: Record<string, number>;
  dbRunId: string | null;
  dbWarning: string | null;
}

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

// 12 requests/minute — under Gemini's free-tier 15 RPM cap with headroom.
const DEFAULT_LLM_MIN_INTERVAL_MS = 5_000;

function getGatewayFor(mode: EvalMode, env: Env, minIntervalMs: number): ThrottledGateway | null {
  if (mode === "rules_only") return null;
  const gateway = createModelGateway("investigator", env);
  return gateway.metadata.provider === "none" ? null : new ThrottledGateway(gateway, minIntervalMs);
}

export async function runEval(options: RunEvalOptions): Promise<RunEvalResult> {
  const { cases, errors } = loadDataset(options.datasetsDir);
  if (errors.length > 0) {
    throw new Error(`Dataset has ${errors.length} error(s), refusing to run:\n${errors.join("\n")}`);
  }

  const inSplit = cases.filter((c: EvalCase) => computeSplit(c.caseId) === options.split);
  if (inSplit.length === 0) {
    throw new Error(`No cases found in split "${options.split}" — is the dataset empty, or the wrong path?`);
  }

  const env = options.env ?? loadEnv();
  const gateway = getGatewayFor(options.mode, env, options.llmMinIntervalMs ?? DEFAULT_LLM_MIN_INTERVAL_MS);

  const startedAt = new Date().toISOString();
  const results: CaseResult[] = [];
  const caseErrors: RunEvalResult["caseErrors"] = [];

  // Sequential, not parallel: rules_llm mode makes real API calls per case
  // inside the escalation band, and this is a local/CI tool, not a
  // production hot path — no reason to risk bursting a free-tier rate limit.
  for (const c of inSplit) {
    let outcome;
    try {
      outcome = await runCase(c, {
        mode: options.mode,
        gateway,
        escalationBand: { min: env.LLM_ESCALATION_BAND_MIN, max: env.LLM_ESCALATION_BAND_MAX },
        failureMode: env.LLM_FAILURE_MODE,
        detectorVersion: "detectors-v2",
        investigatorTimeoutMs: env.LLM_TIMEOUT_MS,
        investigatorTemperature: env.LLM_TEMPERATURE,
        investigatorMaxRetries: env.LLM_MAX_RETRIES,
      });
    } catch (err) {
      caseErrors.push({ caseId: c.caseId, message: err instanceof Error ? err.message : String(err) });
      continue;
    }

    results.push({
      caseId: c.caseId,
      category: c.category,
      origin: c.origin,
      expectedAction: c.expectedAction,
      expectedMinBand: c.expectedMinBand,
      actualAction: outcome.action,
      actualBand: outcome.band,
      latencyMs: outcome.latencyMs,
      llmStatus: outcome.llmStatus,
      correct: isCorrect(c.category, outcome.action),
    });
  }

  const finishedAt = new Date().toISOString();
  const summary = computeMetrics(options.mode, options.split, results);

  const report: EvalReport = {
    summary,
    gitSha: gitSha(),
    modelTag: gateway?.metadata.model ?? null,
    startedAt,
    finishedAt,
  };
  const reportPath = writeJsonReport(options.reportsDir, report);

  let dbRunId: string | null = null;
  let dbWarning: string | null = null;
  if (!options.skipDb) {
    try {
      const client = createServerSupabaseClient(env);
      dbRunId = await writeEvalRunToDb(client, {
        gitSha: report.gitSha,
        modelTag: report.modelTag,
        startedAt,
        finishedAt,
        summary,
        results,
      });
    } catch (err) {
      dbWarning = err instanceof Error ? err.message : String(err);
    }
  }

  return { summary, results, reportPath, caseErrors, llmFailures: Object.fromEntries(gateway?.failures ?? []), dbRunId, dbWarning };
}
