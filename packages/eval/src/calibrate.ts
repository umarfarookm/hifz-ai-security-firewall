#!/usr/bin/env node
/**
 * Task 2.11 (docs/PLAN.md): first calibration of the risk-score thresholds
 * (packages/firewall-core/src/scorer.ts's DEFAULT_THRESHOLDS), tuning split
 * only (the evaluation rule in docs/architecture/HLD.md §12 — held-out is never used to tune
 * anything).
 *
 * Separates two very different failure modes that both show up as "missed
 * detection" in the eval summary table, but need different fixes:
 *   1. No detector fired at all (score 0) — a detector-coverage gap. No
 *      threshold value can fix this; out of scope here, tracked separately.
 *   2. A detector fired, but the resulting score didn't clear a threshold —
 *      this IS what threshold calibration can move. Reports these as
 *      "near misses" and a sensitivity table across a few candidate medium
 *      thresholds, so a human can see the real before/after tradeoff.
 *
 * This never edits DEFAULT_THRESHOLDS itself — it only reports. Recording
 * a change (or "no change needed") is a human decision, written up in
 * docs/decision-log.md once reviewed.
 *
 * Usage: pnpm --filter @hifz/eval run calibrate
 */
import { ingestAdapters, normalize, runDetectors, scoreRisk, DEFAULT_THRESHOLDS, type ContentType, type RiskBand } from "@hifz/firewall-core";
import { loadDataset } from "./loader.js";
import { trustFor } from "./run-case.js";
import { computeSplit } from "./split.js";

function bandFor(score: number, medium: number, high: number, critical: number): RiskBand {
  if (score >= critical) return "CRITICAL";
  if (score >= high) return "HIGH";
  if (score >= medium) return "MEDIUM";
  return "LOW";
}

interface ScoredCase {
  caseId: string;
  category: string;
  score: number;
  hasSignal: boolean;
}

async function main(): Promise<void> {
  const datasetsDir = new URL("../../../datasets", import.meta.url).pathname;
  const { cases, errors } = loadDataset(datasetsDir);
  if (errors.length > 0) {
    console.error("Dataset has errors, aborting:", errors);
    process.exitCode = 1;
    return;
  }

  const tuning = cases.filter((c) => computeSplit(c.caseId) === "tuning");
  const scored: ScoredCase[] = [];

  for (const c of tuning) {
    const adapter = ingestAdapters[c.contentType as ContentType];
    if (!adapter) throw new Error(`no ingest adapter for contentType "${c.contentType}" (case ${c.caseId})`);
    const ingested = await adapter(c.content);
    const signals = runDetectors(normalize(ingested));
    const { score } = scoreRisk({ signals, sourceTrust: trustFor(c.source), sessionRisk: 0 });
    scored.push({ caseId: c.caseId, category: c.category, score, hasSignal: signals.length > 0 });
  }

  console.log(`Scored ${scored.length} of ${tuning.length} tuning-split cases.`);

  const attacks = scored.filter((s) => s.category !== "legitimate");
  const legitimate = scored.filter((s) => s.category === "legitimate");

  const noSignal = attacks.filter((s) => !s.hasSignal);
  console.log(`\n=== Detector-coverage gap (score 0, no threshold can fix this) ===`);
  console.log(`${noSignal.length} / ${attacks.length} attack cases in the tuning split have zero signals fired.`);
  const noSignalByCategory = new Map<string, number>();
  for (const s of noSignal) noSignalByCategory.set(s.category, (noSignalByCategory.get(s.category) ?? 0) + 1);
  for (const [category, count] of [...noSignalByCategory.entries()].sort()) {
    console.log(`  ${category.padEnd(28)} ${count}`);
  }

  console.log(`\n=== Near misses: a signal fired but the score fell short of MEDIUM (${DEFAULT_THRESHOLDS.medium}) ===`);
  const nearMisses = attacks.filter((s) => s.hasSignal && s.score < DEFAULT_THRESHOLDS.medium);
  if (nearMisses.length === 0) {
    console.log("None — every case where a detector fired already cleared MEDIUM under the current threshold.");
  } else {
    for (const s of nearMisses.sort((a, b) => b.score - a.score)) {
      console.log(`  ${s.caseId.padEnd(20)} ${s.category.padEnd(28)} score=${s.score}`);
    }
  }

  console.log(`\n=== Sensitivity: detection rate / FP rate at candidate MEDIUM thresholds (HIGH=${DEFAULT_THRESHOLDS.high}, CRITICAL=${DEFAULT_THRESHOLDS.critical} held fixed) ===`);
  const candidates = [15, 20, 25, DEFAULT_THRESHOLDS.medium, 35, 40];
  console.log(`${"medium".padStart(8)} ${"detection".padStart(10)} ${"FP rate".padStart(10)}`);
  for (const medium of [...new Set(candidates)].sort((a, b) => a - b)) {
    const detected = attacks.filter((s) => bandFor(s.score, medium, DEFAULT_THRESHOLDS.high, DEFAULT_THRESHOLDS.critical) !== "LOW").length;
    const falsePositives = legitimate.filter((s) => bandFor(s.score, medium, DEFAULT_THRESHOLDS.high, DEFAULT_THRESHOLDS.critical) !== "LOW").length;
    const detectionRate = attacks.length === 0 ? 0 : detected / attacks.length;
    const fpRate = legitimate.length === 0 ? 0 : falsePositives / legitimate.length;
    const marker = medium === DEFAULT_THRESHOLDS.medium ? "  <- current" : "";
    console.log(`${String(medium).padStart(8)} ${`${(detectionRate * 100).toFixed(1)}%`.padStart(10)} ${`${(fpRate * 100).toFixed(1)}%`.padStart(10)}${marker}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
