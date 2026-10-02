"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { InspectResponseBody } from "../../lib/inspect.js";
import type { Scenario } from "../../lib/scenarios.js";
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
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-6xl">Scenarios</h1>
          <p className="mt-1.5 max-w-xl text-[18px] leading-relaxed text-ink-dim">
            One scripted attack per committed type. Each replay runs the payload through the live pipeline and records a real audit event.
          </p>
        </div>
        <button
          type="button"
          onClick={replayAll}
          disabled={!scenarios || runningAll}
          className="shrink-0 rounded-xl bg-accent px-6 py-3 text-[18px] font-bold text-ink transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
        >
          {runningAll ? "Running…" : "Run all 7"}
        </button>
      </div>

      {loadError && <p className="mt-8 text-[18px] text-[color:var(--band-critical)]">Could not load scenarios: {loadError}</p>}

      <div className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-2">
        {scenarios?.map((scenario) => {
          const run = runs[scenario.id];
          return (
            <section key={scenario.id} className="flex flex-col rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[19px] font-medium text-ink">{scenario.title}</h2>
                  <p className="mt-1 text-[16px] leading-relaxed text-ink-dim">{scenario.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => replay(scenario.id)}
                  disabled={run?.status === "running"}
                  className="shrink-0 rounded-xl border border-line px-3 py-1 text-[16px] text-ink-dim transition-colors duration-150 hover:border-accent hover:bg-accent-tint disabled:opacity-40"
                >
                  {run?.status === "running" ? "Running…" : "Run"}
                </button>
              </div>

              <pre className="mt-4 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-canvas p-3 font-mono text-[15px] leading-relaxed text-ink-dim">
                {scenario.request.content}
              </pre>
              <div className="mt-1.5 font-mono text-[15px] text-ink-faint">
                {scenario.request.contentType} · {scenario.request.source}
              </div>

              {run?.status === "error" && <p className="mt-4 text-[16px] text-[color:var(--band-critical)]">{run.message}</p>}

              {run?.status === "done" && (
                <div className="mt-4 space-y-2 border-t border-line pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionBadge action={run.result.decision} />
                    <BandBadge band={run.result.finalBand} />
                    <span className="font-mono text-[16px] text-ink-dim">score {run.result.score}</span>
                  </div>
                  <div className="text-[16px] text-ink-dim">{run.result.reason}</div>
                  {run.result.attackTypes.length > 0 && (
                    <div className="font-mono text-[15px] text-ink-faint">detected: {run.result.attackTypes.join(", ")}</div>
                  )}
                  <Link href={`/events/${run.result.eventId}`} className="inline-block text-[16px] text-link hover:underline">
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
