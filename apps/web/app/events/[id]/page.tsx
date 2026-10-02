import Link from "next/link";
import { notFound } from "next/navigation";
import type { Span } from "@hifz/firewall-core";
import { getAuditWriter } from "../../../lib/api-helpers.js";
import { ActionBadge, GuardBadge } from "../../../components/badges.js";
import { ScoreBreakdown } from "../../../components/score-breakdown.js";
import { SignalsList } from "../../../components/signals-list.js";
import { VerdictCard } from "../../../components/verdict-card.js";

export const dynamic = "force-dynamic";

const panel = "rounded-2xl border border-line bg-surface p-5";
const panelLabel = "text-[15px] font-medium uppercase tracking-wide text-ink-faint";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getAuditWriter().getEventDetail(id);

  if (!event) notFound();

  return (
    <div className="rise-in">
      <Link href="/playground" className="text-[16px] text-ink-faint transition-colors duration-150 hover:text-ink-dim">
        ← Back
      </Link>

      <div className="mt-3 flex items-start justify-between">
        <div>
          <h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-6xl">Event detail</h1>
          <p className="mt-1 font-mono text-[15px] text-ink-faint">{event.id}</p>
        </div>
        <ActionBadge action={event.action} />
      </div>

      <div className="mt-9 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <ScoreBreakdown score={event.score} band={event.finalBand} contributions={event.contributions} />

          <div className={panel}>
            <div className={panelLabel}>Decision</div>
            <p className="mt-2 text-[18px] leading-relaxed text-ink-dim">{event.reason}</p>
            <p className="mt-1 font-mono text-[15px] text-ink-faint">{event.policyRuleId}</p>
          </div>

          <div className={panel}>
            <div className={panelLabel}>Content</div>
            <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-[16px] leading-relaxed text-ink-dim">{event.contentExcerpt}</p>
            <p className="mt-3 text-[15px] text-ink-faint">
              {event.contentType} · {event.source} · {event.trust}
            </p>
          </div>

          <div className={panel}>
            <div className={panelLabel}>Timings</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[15px] text-ink-dim">
              {Object.entries(event.timings).map(([stage, ms]) => (
                <span key={stage}>
                  {stage}: {ms.toFixed(2)}ms
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <div className={`mb-2 ${panelLabel}`}>Signals</div>
            <SignalsList
              signals={event.signals.map((s) => ({
                detectorId: s.detectorId,
                attackType: s.attackType,
                severity: s.severity,
                confidence: s.confidence,
                evidence: (Array.isArray(s.evidence) ? (s.evidence as Span[]) : []).map((span) => ({ excerpt: span.excerpt, layer: span.layer })),
              }))}
            />
          </div>

          {event.verdict && <VerdictCard verdict={event.verdict.verdict} steps={event.verdict.steps} />}

          {event.toolCalls.length > 0 && (
            <div>
              <div className={`mb-2 ${panelLabel}`}>Guard checks</div>
              <div className="space-y-2">
                {event.toolCalls.map((call, i) => (
                  <div key={i} className="rounded-2xl border border-line bg-surface p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[18px] text-ink">{call.tool}</span>
                      <GuardBadge outcome={call.outcome} />
                    </div>
                    {call.checks.length > 0 && (
                      <ul className="mt-2 space-y-1 text-[16px] text-ink-faint">
                        {call.checks.map((check) => (
                          <li key={check.checkId}>
                            <span className={check.passed ? "text-[color:var(--band-low)]" : "text-[color:var(--band-critical)]"}>
                              {check.passed ? "✓" : "✗"}
                            </span>{" "}
                            {check.checkId}: {check.detail}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
