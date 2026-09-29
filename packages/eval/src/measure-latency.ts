#!/usr/bin/env node
/**
 * Task 1.10 (docs/PLAN.md): measures real latency for the deterministic
 * pipeline (ingest → normalize → detect) against the full committed
 * dataset. Pure CPU, no I/O, so this is a fair "server-side, excluding
 * network" measurement per docs/architecture/HLD.md §15 regardless of
 * where it's run — Vercel's Node runtime executes the same V8 bytecode.
 *
 * The LLM-path measurement (§15's other target) is a separate, smaller
 * script — see llm-latency-smoke in packages/agents — since it needs real
 * API calls and shouldn't run as part of this CPU benchmark.
 *
 * Usage: pnpm --filter @hifz/eval run measure-latency
 */
import { ingestAdapters, normalize, runDetectors, scoreRisk, type ContentType, type TrustLevel } from "@hifz/firewall-core";
import { loadDataset } from "./loader.js";

// Trust defaults per docs/architecture/LLD.md §2.1 — user_message is
// semi_trusted, everything else external is untrusted. Session risk is 0
// here since each case is measured independently, not as part of a session.
function trustFor(source: string): TrustLevel {
  return source === "user_message" ? "semi_trusted" : "untrusted";
}

const datasetsDir = new URL("../../../datasets", import.meta.url).pathname;

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

function summarize(label: string, durationsMs: number[]): void {
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  console.log(
    `${label}: n=${sorted.length} min=${sorted[0]!.toFixed(3)}ms p50=${percentile(sorted, 50).toFixed(3)}ms ` +
      `p95=${percentile(sorted, 95).toFixed(3)}ms max=${sorted[sorted.length - 1]!.toFixed(3)}ms mean=${mean.toFixed(3)}ms`,
  );
}

function main(): void {
  const { cases, errors } = loadDataset(datasetsDir);
  if (errors.length > 0) {
    console.error("Dataset has errors, aborting:", errors);
    process.exitCode = 1;
    return;
  }

  console.log(`Loaded ${cases.length} cases. Running each through ingest -> normalize -> detect...\n`);

  // One warm-up pass so JIT warm-up doesn't skew the first few real timings.
  for (const c of cases) {
    const adapter = ingestAdapters[c.contentType as ContentType];
    if (!adapter) continue;
    const ingested = adapter(c.content);
    if (ingested instanceof Promise) continue; // pdf — see the skip below, same reasoning
    runDetectors(normalize(ingested));
  }

  const perStageDurations = {
    ingest: [] as number[],
    normalize: [] as number[],
    detect: [] as number[],
    score: [] as number[],
    total: [] as number[],
  };
  let skipped = 0;

  for (const c of cases) {
    const adapter = ingestAdapters[c.contentType as ContentType];
    if (!adapter) {
      skipped++;
      continue;
    }

    const totalStart = process.hrtime.bigint();

    const ingestStart = process.hrtime.bigint();
    const ingestedOrPromise = adapter(c.content);
    if (ingestedOrPromise instanceof Promise) {
      // pdf's real async parse (pdf-parse) isn't pure CPU — measuring it
      // here would contradict this script's own "Pure CPU, no I/O" claim
      // (docs/measurements.md). Skip it the same as a missing adapter.
      skipped++;
      continue;
    }
    const ingested = ingestedOrPromise;
    const ingestEnd = process.hrtime.bigint();

    const normalizeStart = process.hrtime.bigint();
    const normalized = normalize(ingested);
    const normalizeEnd = process.hrtime.bigint();

    const detectStart = process.hrtime.bigint();
    const signals = runDetectors(normalized);
    const detectEnd = process.hrtime.bigint();

    const scoreStart = process.hrtime.bigint();
    scoreRisk({ signals, sourceTrust: trustFor(c.source), sessionRisk: 0 });
    const scoreEnd = process.hrtime.bigint();

    const totalEnd = process.hrtime.bigint();

    const ns = (a: bigint, b: bigint) => Number(b - a) / 1_000_000; // -> ms
    perStageDurations.ingest.push(ns(ingestStart, ingestEnd));
    perStageDurations.normalize.push(ns(normalizeStart, normalizeEnd));
    perStageDurations.detect.push(ns(detectStart, detectEnd));
    perStageDurations.score.push(ns(scoreStart, scoreEnd));
    perStageDurations.total.push(ns(totalStart, totalEnd));
  }

  console.log(`(${skipped} case(s) skipped — no ingest adapter for their contentType (e.g. docx), or an async one (pdf) that isn't pure CPU)\n`);
  summarize("ingest      ", perStageDurations.ingest);
  summarize("normalize   ", perStageDurations.normalize);
  summarize("detect      ", perStageDurations.detect);
  summarize("score       ", perStageDurations.score);
  summarize("TOTAL (①-④)", perStageDurations.total);

  console.log(`\nTarget (HLD §15): deterministic path p95 < 150ms (server-side, excluding network).`);
  const p95Total = percentile([...perStageDurations.total].sort((a, b) => a - b), 95);
  console.log(p95Total < 150 ? `Result: PASS (p95 = ${p95Total.toFixed(3)}ms)` : `Result: MISS (p95 = ${p95Total.toFixed(3)}ms)`);
}

main();
