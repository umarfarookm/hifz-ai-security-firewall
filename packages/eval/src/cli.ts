#!/usr/bin/env node
/**
 * Entry point for `pnpm eval`. The dataset runner (load cases, run the
 * pipeline, write eval_results, print a summary table) lands in Week 2 —
 * see docs/PLAN.md task 2.4. This stub exists so the command resolves and
 * the CI job has something real to call.
 */

function main(): void {
  const mode = process.argv.includes("--mode") ? process.argv[process.argv.indexOf("--mode") + 1] : "rules_only";
  const split = process.argv.includes("--split") ? process.argv[process.argv.indexOf("--split") + 1] : "tuning";

  console.log(`[hifz-eval] mode=${mode} split=${split}`);
  console.log("[hifz-eval] no datasets loaded yet — see docs/PLAN.md task 1.9 / 2.5.");
}

main();
