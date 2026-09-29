"use client";

import { useEffect, useState } from "react";
import type { EvalRunView, MetricsBody } from "../../lib/metrics.js";

const MODES = [
  { key: "rules_only", label: "Rules only" },
  { key: "rules_llm", label: "Rules + LLM" },
] as const;

function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}

function ms(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function RunMeta({ run }: { run: EvalRunView | null }) {
  if (!run) return <span className="text-ink-faint">no run recorded</span>;
  return (
    <span>
      {run.summary.totalCases} cases
      {run.modelTag ? ` · ${run.modelTag}` : ""}
      {run.gitSha ? ` · ${run.gitSha.slice(0, 7)}` : ""}
      {run.finishedAt ? ` · ${new Date(run.finishedAt).toISOString().slice(0, 10)}` : ""}
    </span>
  );
}

function SplitSection({ title, note, runs }: { title: string; note: string; runs: Record<"rules_only" | "rules_llm", EvalRunView | null> }) {
  const present = MODES.filter((m) => runs[m.key]);
  if (present.length === 0) {
    return (
      <section className="mt-10">
        <h2 className="text-[14px] font-medium text-ink">{title}</h2>
        <p className="mt-1 text-[12px] text-ink-dim">{note}</p>
        <div className="mt-4 rounded-lg border border-dashed border-line p-6 text-[13px] text-ink-faint">No run has been recorded for this split yet.</div>
      </section>
    );
  }

  const categories = [...new Set(present.flatMap((m) => runs[m.key]!.summary.categories.map((c) => c.category)))].sort();
  const cell = (run: EvalRunView | null, category: string): string => {
    const c = run?.summary.categories.find((x) => x.category === category);
    if (!c) return "—";
    return category === "legitimate" ? `${pct(c.falsePositiveRate)} FP` : pct(c.detectionRate);
  };

  return (
    <section className="mt-10">
      <h2 className="text-[14px] font-medium text-ink">{title}</h2>
      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ink-dim">{note}</p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3 font-medium">&nbsp;</th>
              {MODES.map((m) => (
                <th key={m.key} className="px-4 py-3 font-medium">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-ink">
            <tr className="border-b border-line">
              <td className="px-4 py-2.5 font-sans text-ink-dim">Detection rate</td>
              {MODES.map((m) => (
                <td key={m.key} className="px-4 py-2.5">
                  {pct(runs[m.key]?.summary.overallDetectionRate)}
                </td>
              ))}
            </tr>
            <tr className="border-b border-line">
              <td className="px-4 py-2.5 font-sans text-ink-dim">False-positive rate</td>
              {MODES.map((m) => (
                <td key={m.key} className="px-4 py-2.5">
                  {pct(runs[m.key]?.summary.overallFalsePositiveRate)}
                </td>
              ))}
            </tr>
            <tr className="border-b border-line">
              <td className="px-4 py-2.5 font-sans text-ink-dim">Precision / recall</td>
              {MODES.map((m) => (
                <td key={m.key} className="px-4 py-2.5">
                  {runs[m.key] ? `${pct(runs[m.key]!.summary.precision)} / ${pct(runs[m.key]!.summary.recall)}` : "—"}
                </td>
              ))}
            </tr>
            <tr className="border-b border-line">
              <td className="px-4 py-2.5 font-sans text-ink-dim">Latency p50 / p95</td>
              {MODES.map((m) => (
                <td key={m.key} className="px-4 py-2.5">
                  {runs[m.key] ? `${ms(runs[m.key]!.summary.latency.p50)} / ${ms(runs[m.key]!.summary.latency.p95)}` : "—"}
                </td>
              ))}
            </tr>
            <tr className="border-b border-line">
              <td className="px-4 py-2.5 font-sans text-ink-dim">LLM calls that failed safe</td>
              {MODES.map((m) => {
                const counts = runs[m.key]?.summary.llmStatusCounts;
                const failed = counts ? (counts.unavailable ?? 0) + (counts.invalid_output ?? 0) : null;
                return (
                  <td key={m.key} className="px-4 py-2.5">
                    {m.key === "rules_only" || failed === null ? "—" : failed}
                  </td>
                );
              })}
            </tr>
            <tr className="border-b border-line text-[11px] text-ink-faint">
              <td className="px-4 py-2.5 font-sans">Run</td>
              {MODES.map((m) => (
                <td key={m.key} className="px-4 py-2.5 font-sans">
                  <RunMeta run={runs[m.key]} />
                </td>
              ))}
            </tr>
            {categories.map((category) => (
              <tr key={category} className="border-b border-line last:border-b-0">
                <td className="px-4 py-2.5 font-sans text-ink-dim">{category}</td>
                {MODES.map((m) => (
                  <td key={m.key} className="px-4 py-2.5">
                    {cell(runs[m.key], category)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function EvaluationPage() {
  const [metrics, setMetrics] = useState<MetricsBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/metrics")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setMetrics(json as MetricsBody);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="rise-in">
      <h1 className="text-xl font-medium tracking-tight text-ink">Evaluation</h1>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-dim">
        Results from the dataset runner, read from the latest recorded runs. Nothing on this page is hard-coded.
      </p>

      {error && <p className="mt-8 text-[13px] text-[color:var(--band-critical)]">Could not load metrics: {error}</p>}
      {!metrics && !error && <p className="mt-8 text-[13px] text-ink-faint">Loading…</p>}

      {metrics && (
        <>
          <SplitSection
            title="Held-out split"
            note="Cases never used to write or tune a rule or threshold. This is the fair estimate."
            runs={metrics.latestEval.heldout}
          />
          <SplitSection
            title="Tuning split"
            note="Cases the rules and thresholds were developed against. Optimistic by construction — shown for transparency, not as the headline."
            runs={metrics.latestEval.tuning}
          />

          <section className="mt-10">
            <h2 className="text-[14px] font-medium text-ink">Live counters</h2>
            <p className="mt-1 text-[12px] text-ink-dim">All inspections recorded by this deployment, including scenario replays.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["ALLOW", "SANITIZE", "REVIEW", "BLOCK"] as const).map((action) => (
                <div key={action} className="rounded-lg border border-line bg-surface p-4">
                  <div className="text-[11px] uppercase tracking-wide text-ink-faint">{action}</div>
                  <div className="mt-1.5 font-mono text-lg text-ink">{metrics.counters.byAction[action]}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 font-mono text-[11px] text-ink-faint">total inspections: {metrics.counters.totalInspections}</div>
          </section>
        </>
      )}
    </div>
  );
}
