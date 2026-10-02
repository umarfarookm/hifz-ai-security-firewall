"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { InspectResponseBody } from "../../lib/inspect.js";
import type { Scenario } from "../../lib/scenarios.js";
import { ATTACK_PLAIN, CONTENT_TYPE_PLAIN, SOURCE_PLAIN } from "../../components/plain-labels.js";
import { ActionBadge, BandBadge } from "../../components/badges.js";

type RunState = { status: "running" } | { status: "done"; result: InspectResponseBody } | { status: "error"; message: string };

export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [runningAll, setRunningAll] = useState(false);

  useEffect(() => {
    fetch("/api/v1/scenarios")
      .then((res) => res.json())
      .then((json) => setScenarios(json.scenarios as Scenario[]))
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function replay(id: string): Promise<void> {
    setRuns((prev) => ({ ...prev, [id]: { status: "running" } }));
    try {
      const res = await fetch(`/api/v1/scenarios/${id}/replay`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setRuns((prev) => ({ ...prev, [id]: { status: "error", message: json.error ?? `HTTP ${res.status}` } }));
        return;
      }
      setRuns((prev) => ({ ...prev, [id]: { status: "done", result: json as InspectResponseBody } }));
    } catch (err) {
      setRuns((prev) => ({ ...prev, [id]: { status: "error", message: err instanceof Error ? err.message : String(err) } }));
    }
  }

  async function replayAll(): Promise<void> {
    if (!scenarios) return;
    setRunningAll(true);
    for (const scenario of scenarios) await replay(scenario.id);
    setRunningAll(false);
  }

  return (
    <div className="rise-in">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-6xl">Scenarios</h1>
          <p className="mt-5 max-w-3xl text-2xl leading-relaxed text-ink-dim">
            One ready-made attack for each of the seven types we catch. Press Run to send it through the real firewall and see what happens. Each run is recorded in the audit log.
          </p>
        </div>
        <button
          type="button"
          onClick={replayAll}
          disabled={!scenarios || runningAll}
          className="inline-flex h-16 shrink-0 items-center rounded-2xl bg-accent px-8 text-2xl font-bold text-ink transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
        >
          {runningAll ? "Running…" : "Run all 7"}
        </button>
      </div>

      {loadError && <p className="mt-8 text-[18px] text-[color:var(--band-critical)]">Could not load scenarios: {loadError}</p>}

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        {scenarios?.map((scenario) => {
          const run = runs[scenario.id];
          return (
            <section key={scenario.id} className="flex flex-col rounded-3xl border border-line bg-surface p-6 sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight text-ink">{scenario.title}</h2>
                  <p className="mt-2 text-lg leading-relaxed text-ink-dim">{scenario.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => replay(scenario.id)}
                  disabled={run?.status === "running"}
                  className="inline-flex h-12 shrink-0 items-center rounded-xl border-2 border-line-strong px-5 text-lg font-bold text-ink transition-colors duration-150 hover:border-accent hover:bg-accent-tint disabled:opacity-40"
                >
                  {run?.status === "running" ? "Running…" : "Run"}
                </button>
              </div>

              <div className="mt-5 text-[16px] font-bold text-ink">The attack</div>
              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl border border-line bg-canvas p-4 font-mono text-[15px] leading-relaxed text-ink">
                {scenario.request.content}
              </pre>
              <div className="mt-2 text-[16px] text-ink-dim">
                {CONTENT_TYPE_PLAIN[scenario.request.contentType] ?? scenario.request.contentType}, sent as {SOURCE_PLAIN[scenario.request.source] ?? scenario.request.source}
              </div>

              {run?.status === "error" && <p className="mt-4 text-lg text-[color:var(--band-critical)]">{run.message}</p>}

              {run?.status === "done" && (
                <div className="mt-5 space-y-3 border-t border-line pt-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionBadge action={run.result.decision} />
                    <BandBadge band={run.result.finalBand} />
                    <span className="text-[17px] font-bold text-ink-dim">risk {run.result.score} out of 100</span>
                  </div>
                  <div className="text-lg leading-relaxed text-ink">{run.result.reason}</div>
                  {run.result.attackTypes.length > 0 && (
                    <div className="text-[16px] text-ink-dim">
                      <div className="font-mono">detected: {run.result.attackTypes.join(", ")}</div>
                      {run.result.attackTypes.map((t) => (ATTACK_PLAIN[t] ? <div key={t}>{ATTACK_PLAIN[t]}</div> : null))}
                    </div>
                  )}
                  <Link href={`/events/${run.result.eventId}`} className="inline-flex min-h-11 items-center text-lg font-bold text-link hover:underline">
                    View full event →
                  </Link>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
