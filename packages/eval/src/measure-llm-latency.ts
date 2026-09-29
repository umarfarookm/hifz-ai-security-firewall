#!/usr/bin/env node
/**
 * Task 1.10 (docs/PLAN.md): measures real LLM-path latency by calling the
 * live, deployed /api/v1/dev/investigate route (task 2.6's temporary dev
 * endpoint) with real content and real detector signals — not mocks.
 *
 * This measures wall-clock time from this machine, so it includes network
 * to Vercel in addition to Vercel's own call out to the model provider —
 * a conservative (upper-bound), but honest and reproducible, number.
 * Costs real API quota — keep the sample small. Never run this in CI.
 *
 * Usage: pnpm --filter @hifz/eval run measure-llm-latency [url]
 */
import { ingestAdapters, normalize, runDetectors, type ContentType } from "@hifz/firewall-core";
import { loadDataset } from "./loader.js";

const DEFAULT_URL = "https://hifz-ai-security-firewall.vercel.app/api/v1/dev/investigate";
const SAMPLE_PER_CATEGORY = 2;

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

async function main(): Promise<void> {
  const url = process.argv[2] ?? DEFAULT_URL;
  const datasetsDir = new URL("../../../datasets", import.meta.url).pathname;
  const { cases, errors } = loadDataset(datasetsDir);
  if (errors.length > 0) {
    console.error("Dataset has errors, aborting:", errors);
    process.exitCode = 1;
    return;
  }

  const byCategory = new Map<string, typeof cases>();
  for (const c of cases) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }

  const sample = [...byCategory.values()].flatMap((list) => list.slice(0, SAMPLE_PER_CATEGORY));
  console.log(`Sampling ${sample.length} cases across ${byCategory.size} categories against ${url}\n`);

  const latencies: number[] = [];
  const statuses: string[] = [];

  for (const c of sample) {
    const adapter = ingestAdapters[c.contentType as ContentType];
    const signals = adapter ? runDetectors(normalize(await adapter(c.content))) : [];

    const start = Date.now();
    let status = "error";
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: c.content, signals }),
      });
      const body = (await response.json()) as { llmStatus?: string };
      status = body.llmStatus ?? `http_${response.status}`;
    } catch (err) {
      status = `fetch_error: ${err instanceof Error ? err.message : String(err)}`;
    }
    const latencyMs = Date.now() - start;

    latencies.push(latencyMs);
    statuses.push(status);
    console.log(`${c.caseId.padEnd(14)} ${latencyMs.toString().padStart(6)}ms  ${status}`);
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const okCount = statuses.filter((s) => s === "ok" || s === "cached").length;

  console.log(`\nn=${sorted.length} min=${sorted[0]}ms p50=${percentile(sorted, 50)}ms p95=${percentile(sorted, 95)}ms max=${sorted[sorted.length - 1]}ms`);
  console.log(`Reliability: ${okCount}/${sorted.length} returned a usable verdict (llmStatus ok/cached).`);
  console.log(`\nTarget (HLD §15): LLM path p95 < 8000ms on a free-tier model.`);
  const p95 = percentile(sorted, 95);
  console.log(p95 < 8000 ? `Result: PASS (p95 = ${p95}ms)` : `Result: MISS (p95 = ${p95}ms)`);
}

main();
