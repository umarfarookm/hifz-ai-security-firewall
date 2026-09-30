#!/usr/bin/env node
/**
 * Entry point for `pnpm eval`. Loads the dataset, runs the pipeline in the
 * requested mode against the requested split, writes eval_results + a JSON
 * report, and prints a per-category summary table.
 * See docs/architecture/LLD.md §7 and docs/PLAN.md task 2.4.
 *
 * Usage: pnpm eval --mode rules_only|rules_llm --split tuning|heldout [--skip-db] [--llm-min-interval-ms N]
 */
import { config } from "dotenv";
import { runEval } from "./runner.js";

// pnpm runs this with cwd = packages/eval; .env.local lives at the repo root.
// Same pattern as packages/agents/src/smoke.ts.
config({ path: "../../.env.local" });
import { printSummaryTable } from "./report.js";
import type { EvalMode } from "./run-case.js";
import type { SplitAssignment } from "./split.js";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function parseMode(): EvalMode {
  const value = argValue("--mode") ?? "rules_only";
  if (value !== "rules_only" && value !== "rules_llm") {
    throw new Error(`--mode must be "rules_only" or "rules_llm", got "${value}"`);
  }
  return value;
}

function parseSplit(): SplitAssignment {
  const value = argValue("--split") ?? "tuning";
  if (value !== "tuning" && value !== "heldout") {
    throw new Error(`--split must be "tuning" or "heldout", got "${value}"`);
  }
  return value;
}

async function main(): Promise<void> {
  const mode = parseMode();
  const split = parseSplit();
  const skipDb = process.argv.includes("--skip-db");
  const llmMinIntervalMs = argValue("--llm-min-interval-ms");

  const datasetsDir = new URL("../../../datasets", import.meta.url).pathname;
  const reportsDir = new URL("../../../eval-reports", import.meta.url).pathname;

  const result = await runEval({ mode, split, datasetsDir, reportsDir, skipDb, ...(llmMinIntervalMs ? { llmMinIntervalMs: Number(llmMinIntervalMs) } : {}) });

  printSummaryTable(result.summary);
  const failureEntries = Object.entries(result.llmFailures);
  if (failureEntries.length > 0) {
    console.warn(`\n[hifz-eval] model request failures (explains any "unavailable" investigator status):`);
    for (const [message, count] of failureEntries) console.warn(`  ${count}x ${message}`);
  }
  if (result.caseErrors.length > 0) {
    console.warn(`\n[hifz-eval] ${result.caseErrors.length} case(s) errored and are excluded from the metrics above:`);
    for (const e of result.caseErrors) console.warn(`  ${e.caseId}: ${e.message}`);
    process.exitCode = 1;
  }
  console.log(`\nReport written to ${result.reportPath}`);

  if (result.dbWarning) {
    console.warn(`\n[hifz-eval] warning: did not write to eval_runs/eval_results — ${result.dbWarning}`);
  } else if (result.dbRunId) {
    console.log(`Recorded in eval_runs as ${result.dbRunId}`);
  } else {
    console.log(`--skip-db set — did not write to eval_runs/eval_results.`);
  }
}

main().catch((err) => {
  console.error(`[hifz-eval] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
