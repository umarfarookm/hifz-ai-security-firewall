"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { EventListPage } from "../../lib/audit.js";
import type { MetricsBody } from "../../lib/metrics.js";
import { bandRows, percent, relativeTime } from "../../lib/dashboard.js";
import { ActionBadge, BandBadge } from "../../components/badges.js";
import { CONTENT_TYPE_PLAIN } from "../../components/plain-labels.js";

interface DashboardData {
  metrics: MetricsBody;
  events: EventListPage["items"];
  /** Number of pending review items, capped by the page size of the request. */
  pendingReviews: number;
  loadedAt: number;
}

const PENDING_PAGE = 100;

const ACTION_PLAIN = { ALLOW: "safe", SANITIZE: "cleaned first", REVIEW: "held for a person", BLOCK: "blocked" } as const;
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

function Tile({ label, plain, value, note, href }: { label: string; plain: string; value: string; note?: string; href?: string }) {
  const body = (
    <div className="h-full rounded-3xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-accent">
      <div className="text-[15px] font-bold uppercase tracking-wide text-ink-dim">{label}</div>
      {/* Proportional figures on purpose: tabular digits look loose at display size. */}
      <div className="mt-2 font-sans text-5xl font-extrabold leading-none tracking-tight text-ink">{value}</div>
      <div className="mt-2 text-lg font-bold leading-snug text-ink">{plain}</div>
      {note && <div className="mt-1 text-[16px] text-ink-dim">{note}</div>}
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
          <h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-6xl">Dashboard</h1>
          <p className="mt-5 max-w-3xl text-2xl leading-relaxed text-ink-dim">
            A live summary of everything the firewall has checked on this site. Every number is read from the audit log and the recorded evaluation runs, and refreshes by itself.
          </p>
        </div>
        {data && <span className="font-mono text-[15px] text-ink-faint">updated {new Date(data.loadedAt).toLocaleTimeString()}</span>}
      </div>

      {error && !data && <p className="mt-8 text-[18px] text-[color:var(--band-critical)]">Could not load the dashboard: {error}</p>}
      {error && data && <p className="mt-4 text-[16px] text-ink-faint">Refresh failed ({error}); showing the last data.</p>}
      {!data && !error && <p className="mt-8 text-[18px] text-ink-faint">Loading…</p>}

      {data && counters && (
        <>
          <section className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6" aria-label="Headline counts">
            <Tile label="Inspections" plain="items checked" value={String(total)} note="all time" />
            {(["ALLOW", "SANITIZE", "REVIEW", "BLOCK"] as const).map((action) => (
              <Tile key={action} label={action} plain={ACTION_PLAIN[action]} value={String(counters.byAction[action])} {...(total ? { note: `${percent(counters.byAction[action] / total)} of all` } : {})} />
            ))}
            <Tile
              label="Awaiting review"
              plain="waiting for a person"
              value={data.pendingReviews >= PENDING_PAGE ? `${PENDING_PAGE}+` : String(data.pendingReviews)}
              note="open the queue →"
              href="/reviews"
            />
          </section>

          <section className="mt-10" aria-label="Inspections by risk band">
            <h2 className="text-3xl font-extrabold tracking-tight text-ink">Risk band distribution</h2>
            <p className="mt-2 text-lg text-ink-dim">The final band after the investigator, for every inspection. Low is on top.</p>
            <ul className="mt-4 space-y-3">
              {bands.map((row) => (
                <li key={row.band} className="grid grid-cols-[124px_1fr_auto] sm:grid-cols-[150px_1fr_auto] items-center gap-3" aria-label={`${row.band}: ${row.count} inspections, ${percent(row.share)}`}>
                  <BandBadge band={row.band} />
                  <div className="h-3 w-full rounded-full bg-line" title={`${row.band}: ${row.count} (${percent(row.share, 1)})`}>
                    {row.count > 0 && (
                      <div
                        className="h-3 rounded-r-[4px] rounded-l-full"
                        // A 2px floor keeps a tiny non-zero share visible; the count beside it carries the exact value.
                        style={{ width: `max(2px, ${row.share * 100}%)`, backgroundColor: `var(--band-${row.band.toLowerCase()})` }}
                      />
                    )}
                  </div>
                  <div className="w-[88px] text-right font-mono text-[16px] text-ink-dim">
                    <span className="text-ink">{row.count}</span> · {percent(row.share)}
                  </div>
                </li>
              ))}
            </ul>
            {total === 0 && <p className="mt-3 text-[16px] text-ink-faint">No inspections recorded yet.</p>}
          </section>

          <section className="mt-10" aria-label="Latest events">
            <div className="flex items-baseline justify-between">
              <h2 className="text-3xl font-extrabold tracking-tight text-ink">Latest events</h2>
              <span className="text-[16px] text-ink-faint">newest first, up to 10</span>
            </div>
            {data.events.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-line p-8 text-center text-[18px] text-ink-faint">No events recorded yet.</div>
            ) : (
              <>
<div className="mt-5 hidden overflow-x-auto rounded-3xl border border-line bg-surface md:block">
                <table className="w-full text-left text-lg">
                  <thead>
                    <tr className="border-b border-line text-[15px] uppercase tracking-wide text-ink-faint">
                      <th className="px-5 py-4 font-bold">When</th>
                      <th className="px-5 py-4 font-bold">Decision</th>
                      <th className="px-5 py-4 font-bold">Band</th>
                      <th className="px-5 py-4 font-bold">Score</th>
                      <th className="px-5 py-4 font-bold">Detected</th>
                      <th className="px-5 py-4 font-bold">Input</th>
                      <th className="px-5 py-4 font-bold">&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((event) => (
                      <tr key={event.id} className="border-b border-line last:border-b-0">
                        <td className="whitespace-nowrap px-5 py-3.5 text-ink-dim" title={new Date(event.createdAt).toLocaleString()}>
                          {relativeTime(event.createdAt, now)}
                        </td>
                        <td className="px-5 py-3.5">
                          <ActionBadge action={event.action} />
                        </td>
                        <td className="px-5 py-3.5">
                          <BandBadge band={event.finalBand} />
                        </td>
                        <td className="px-5 py-3.5 font-mono tabular-nums text-ink">{event.score}</td>
                        <td className="px-5 py-3.5 text-ink-dim">{event.attackTypes.length ? event.attackTypes.join(", ").replaceAll("_", " ") : "—"}</td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-[16px] text-ink-dim">
                          <span title={`from: ${event.source}`}>{CONTENT_TYPE_PLAIN[event.contentType] ?? event.contentType}</span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-right">
                          <Link href={`/events/${event.id}`} className="text-[16px] text-link hover:underline">
                            Details →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* On a phone the same events are cards: a seven-column table cannot be read without scrolling sideways. */}
              <div className="mt-5 space-y-3 md:hidden">
                {data.events.map((event) => (
                  <Link key={event.id} href={`/events/${event.id}`} className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-accent">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionBadge action={event.action} />
                        <BandBadge band={event.finalBand} />
                      </div>
                      <span className="text-[16px] text-ink-dim">{relativeTime(event.createdAt, now)}</span>
                    </div>
                    <div className="mt-3 text-lg font-bold leading-snug text-ink">
                      {event.attackTypes.length ? event.attackTypes.join(", ").replaceAll("_", " ") : "Nothing suspicious found"}
                    </div>
                    <div className="mt-1 text-[16px] text-ink-dim">
                      {CONTENT_TYPE_PLAIN[event.contentType] ?? event.contentType} · score {event.score}
                    </div>
                  </Link>
                ))}
              </div>
              </>
            )}
          </section>

          <section className="mt-10" aria-label="Held-out evaluation">
            <div className="flex items-baseline justify-between">
              <h2 className="text-3xl font-extrabold tracking-tight text-ink">Held-out evaluation</h2>
              <Link href="/evaluation" className="text-[16px] text-link hover:underline">
                Full report →
              </Link>
            </div>
            <p className="mt-2 text-lg text-ink-dim">Cases never used to write or tune a rule. The latest recorded run in each mode.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ["rules_only", "Rules only"],
                  ["rules_llm", "Rules + LLM"],
                ] as const
              ).map(([mode, label]) => {
                const run = heldout?.[mode] ?? null;
                return (
                  <div key={mode} className="rounded-3xl border border-line bg-surface p-6">
                    <div className="text-[15px] uppercase tracking-wide text-ink-faint">{label}</div>
                    {run ? (
                      <>
                        <div className="mt-3 flex gap-8">
                          <div>
                            <div className="font-sans text-6xl font-extrabold leading-none tracking-tight text-ink">{percent(run.summary.overallDetectionRate, 1)}</div>
                            <div className="mt-2 text-lg font-bold text-ink">detection</div><div className="text-[16px] text-ink-dim">of the attacks, how many we caught</div>
                          </div>
                          <div>
                            <div className="font-sans text-6xl font-extrabold leading-none tracking-tight text-ink">{percent(run.summary.overallFalsePositiveRate, 1)}</div>
                            <div className="mt-2 text-lg font-bold text-ink">false positives</div><div className="text-[16px] text-ink-dim">harmless items wrongly flagged</div>
                          </div>
                        </div>
                        <div className="mt-3 text-[15px] text-ink-faint">
                          {run.summary.totalCases} cases{run.modelTag ? ` · ${run.modelTag}` : ""}
                          {run.finishedAt ? ` · ${new Date(run.finishedAt).toISOString().slice(0, 10)}` : ""}
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 text-[18px] text-ink-faint">No held-out run recorded.</p>
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
