import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalSummary } from "./metrics.js";

export interface EvalReport {
  summary: EvalSummary;
  gitSha: string;
  modelTag: string | null;
  startedAt: string;
  finishedAt: string;
}

/** Writes the JSON report artefact LLD §7's runner spec calls for, to the gitignored eval-reports/ dir. */
export function writeJsonReport(reportsDir: string, report: EvalReport): string {
  mkdirSync(reportsDir, { recursive: true });
  const timestamp = report.finishedAt.replace(/[:.]/g, "-");
  const path = join(reportsDir, `${report.summary.mode}-${report.summary.split}-${timestamp}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return path;
}

function pct(value: number | null): string {
  return value === null ? "  n/a" : `${(value * 100).toFixed(1)}%`.padStart(6);
}

/** Prints the per-category summary table (docs/PLAN.md task 2.4's acceptance criterion). */
export function printSummaryTable(summary: EvalSummary): void {
  console.log(`\n[hifz-eval] mode=${summary.mode} split=${summary.split} cases=${summary.totalCases}\n`);

  const header = `${"category".padEnd(28)} ${"n".padStart(4)} ${"detection".padStart(10)} ${"FP rate".padStart(10)} ${"band met".padStart(9)}`;
  console.log(header);
  console.log("-".repeat(header.length));

  for (const c of summary.categories) {
    console.log(
      `${c.category.padEnd(28)} ${String(c.total).padStart(4)} ${pct(c.detectionRate).padStart(10)} ${pct(c.falsePositiveRate).padStart(10)} ${String(c.bandMet).padStart(9)}`,
    );
  }

  console.log("-".repeat(header.length));
  console.log(`\nOverall detection rate:     ${pct(summary.overallDetectionRate)}`);
  console.log(`Overall false-positive rate: ${pct(summary.overallFalsePositiveRate)}`);
  console.log(`Precision: ${pct(summary.precision)}   Recall: ${pct(summary.recall)}`);
  const statuses = Object.entries(summary.llmStatusCounts).map(([k, v]) => `${k}=${v}`).join(" ");
  console.log(`Investigator status: ${statuses}`);
  if ((summary.llmStatusCounts.unavailable ?? 0) + (summary.llmStatusCounts.invalid_output ?? 0) > 0) {
    console.warn("WARNING: some cases hit an LLM failure and failed safe to REVIEW — not a clean rules+LLM measurement.");
  }
  console.log(
    `Latency (n=${summary.latency.n}): p50=${summary.latency.p50.toFixed(1)}ms p95=${summary.latency.p95.toFixed(1)}ms mean=${summary.latency.mean.toFixed(1)}ms`,
  );
}
