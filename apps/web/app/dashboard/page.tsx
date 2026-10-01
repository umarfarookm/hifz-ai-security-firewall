"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { EventListPage } from "../../lib/audit.js";
import type { MetricsBody } from "../../lib/metrics.js";
import { bandRows, percent, relativeTime } from "../../lib/dashboard.js";
import { ActionBadge, BandBadge } from "../../components/badges.js";

interface DashboardData {
  metrics: MetricsBody;
  events: EventListPage["items"];
  /** Number of pending review items, capped by the page size of the request. */
  pendingReviews: number;
  loadedAt: number;
}

const PENDING_PAGE = 100;
const REFRESH_MS = 15_000;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

async function loadDashboard(): Promise<DashboardData> {
  const [metrics, events, reviews] = await Promise.all([
    getJson<MetricsBody>("/api/v1/metrics"),
    getJson<EventListPage>("/api/v1/events?limit=10"),
    getJson<{ items: unknown[] }>(`/api/v1/reviews?state=PENDING&limit=${PENDING_PAGE}`),
  ]);
  return { metrics, events: events.items, pendingReviews: reviews.items.length, loadedAt: Date.now() };
}

function Tile({ label, value, note, href }: { label: string; value: string; note?: string; href?: string }) {
  const body = (
    <div className="rounded-lg border border-line bg-surface p-4 transition-colors duration-150 hover:border-line-strong">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
      {/* Proportional figures on purpose: tabular digits look loose at display size. */}
      <div className="mt-1.5 font-sans text-[28px] font-medium leading-none tracking-tight text-ink">{value}</div>
      {note && <div className="mt-2 text-[12px] text-ink-dim">{note}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      // Replace the data in place: the previous render stays on screen until the new one arrives, so there is no flash.
      setData(await loadDashboard());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  const counters = data?.metrics.counters;
  const total = counters?.totalInspections ?? 0;
  const bands = counters ? bandRows(counters.byBand) : [];
  const heldout = data?.metrics.latestEval.heldout;

  return (
    <div className="rise-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-ink">Dashboard</h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-dim">
            What the firewall has seen on this deployment. Every figure is read from the audit log and the recorded evaluation runs, and refreshes by itself.
          </p>
        </div>
        {data && <span className="font-mono text-[11px] text-ink-faint">updated {new Date(data.loadedAt).toLocaleTimeString()}</span>}
      </div>

      {error && !data && <p className="mt-8 text-[13px] text-[color:var(--band-critical)]">Could not load the dashboard: {error}</p>}
      {error && data && <p className="mt-4 text-[12px] text-ink-faint">Refresh failed ({error}); showing the last data.</p>}
      {!data && !error && <p className="mt-8 text-[13px] text-ink-faint">Loading…</p>}

      {data && counters && (
        <>
          <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Headline counts">
            <Tile label="Inspections" value={String(total)} note="all time" />
            {(["ALLOW", "SANITIZE", "REVIEW", "BLOCK"] as const).map((action) => (
              <Tile key={action} label={action} value={String(counters.byAction[action])} {...(total ? { note: `${percent(counters.byAction[action] / total)} of all` } : {})} />
            ))}
            <Tile
              label="Awaiting review"
              value={data.pendingReviews >= PENDING_PAGE ? `${PENDING_PAGE}+` : String(data.pendingReviews)}
              note="open the queue →"
              href="/reviews"
            />
          </section>

          <section className="mt-10" aria-label="Inspections by risk band">
            <h2 className="text-[14px] font-medium text-ink">Risk band distribution</h2>
            <p className="mt-1 text-[12px] text-ink-dim">The final band after the investigator, for every inspection. Low is on top.</p>
            <ul className="mt-4 space-y-3">
              {bands.map((row) => (
                <li key={row.band} className="grid grid-cols-[88px_1fr_auto] items-center gap-3" aria-label={`${row.band}: ${row.count} inspections, ${percent(row.share)}`}>
                  <BandBadge band={row.band} />
                  <div className="h-2 w-full rounded-full bg-line/40" title={`${row.band}: ${row.count} (${percent(row.share, 1)})`}>
                    {row.count > 0 && (
                      <div
                        className="h-2 rounded-r-[4px] rounded-l-full"
                        // A 2px floor keeps a tiny non-zero share visible; the count beside it carries the exact value.
                        style={{ width: `max(2px, ${row.share * 100}%)`, backgroundColor: `var(--band-${row.band.toLowerCase()})` }}
                      />
                    )}
                  </div>
                  <div className="w-[88px] text-right font-mono text-[12px] text-ink-dim">
                    <span className="text-ink">{row.count}</span> · {percent(row.share)}
                  </div>
                </li>
              ))}
            </ul>
            {total === 0 && <p className="mt-3 text-[12px] text-ink-faint">No inspections recorded yet.</p>}
          </section>

          <section className="mt-10" aria-label="Latest events">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[14px] font-medium text-ink">Latest events</h2>
              <span className="text-[12px] text-ink-faint">newest first, up to 10</span>
            </div>
            {data.events.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-line p-8 text-center text-[13px] text-ink-faint">No events recorded yet.</div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-faint">
                      <th className="px-4 py-3 font-medium">When</th>
                      <th className="px-4 py-3 font-medium">Decision</th>
                      <th className="px-4 py-3 font-medium">Band</th>
                      <th className="px-4 py-3 font-medium">Score</th>
                      <th className="px-4 py-3 font-medium">Detected</th>
                      <th className="px-4 py-3 font-medium">Input</th>
                      <th className="px-4 py-3 font-medium">&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((event) => (
                      <tr key={event.id} className="border-b border-line last:border-b-0">
                        <td className="whitespace-nowrap px-4 py-2.5 text-ink-dim" title={new Date(event.createdAt).toLocaleString()}>
                          {relativeTime(event.createdAt, now)}
                        </td>
                        <td className="px-4 py-2.5">
                          <ActionBadge action={event.action} />
                        </td>
                        <td className="px-4 py-2.5">
                          <BandBadge band={event.finalBand} />
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-ink">{event.score}</td>
                        <td className="px-4 py-2.5 text-ink-dim">{event.attackTypes.length ? event.attackTypes.join(", ").replaceAll("_", " ") : "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-ink-faint">
                          {event.contentType} · {event.source}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <Link href={`/events/${event.id}`} className="text-[12px] text-accent hover:underline">
                            Details →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-10" aria-label="Held-out evaluation">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[14px] font-medium text-ink">Held-out evaluation</h2>
              <Link href="/evaluation" className="text-[12px] text-accent hover:underline">
                Full report →
              </Link>
            </div>
            <p className="mt-1 text-[12px] text-ink-dim">Cases never used to write or tune a rule. The latest recorded run in each mode.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ["rules_only", "Rules only"],
                  ["rules_llm", "Rules + LLM"],
                ] as const
              ).map(([mode, label]) => {
                const run = heldout?.[mode] ?? null;
                return (
                  <div key={mode} className="rounded-lg border border-line bg-surface p-5">
                    <div className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
                    {run ? (
                      <>
                        <div className="mt-3 flex gap-8">
                          <div>
                            <div className="font-sans text-[28px] font-medium leading-none tracking-tight text-ink">{percent(run.summary.overallDetectionRate, 1)}</div>
                            <div className="mt-1.5 text-[12px] text-ink-dim">detection</div>
                          </div>
                          <div>
                            <div className="font-sans text-[28px] font-medium leading-none tracking-tight text-ink">{percent(run.summary.overallFalsePositiveRate, 1)}</div>
                            <div className="mt-1.5 text-[12px] text-ink-dim">false positives</div>
                          </div>
                        </div>
                        <div className="mt-3 text-[11px] text-ink-faint">
                          {run.summary.totalCases} cases{run.modelTag ? ` · ${run.modelTag}` : ""}
                          {run.finishedAt ? ` · ${new Date(run.finishedAt).toISOString().slice(0, 10)}` : ""}
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 text-[13px] text-ink-faint">No held-out run recorded.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
