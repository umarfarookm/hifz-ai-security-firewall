import Link from "next/link";
import { notFound } from "next/navigation";
import type { Span } from "@hifz/firewall-core";
import { getAuditWriter } from "../../../lib/api-helpers.js";
import { GuardBadge } from "../../../components/badges.js";
import { CHECK_PLAIN, CONTENT_TYPE_PLAIN, SOURCE_PLAIN, TOOL_PLAIN, TRUST_PLAIN } from "../../../components/plain-labels.js";
import { ScoreBreakdown } from "../../../components/score-breakdown.js";
import { SignalsList } from "../../../components/signals-list.js";
import { VerdictBanner } from "../../../components/verdict-banner.js";
import { VerdictCard } from "../../../components/verdict-card.js";

export const dynamic = "force-dynamic";

const card = "rounded-3xl border border-line bg-surface p-6 sm:p-8";
const heading = "text-2xl font-extrabold tracking-tight text-ink sm:text-3xl";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getAuditWriter().getEventDetail(id);

  if (!event) notFound();

  const attackTypes = [...new Set(event.signals.map((s) => s.attackType))];
  const kind = CONTENT_TYPE_PLAIN[event.contentType] ?? event.contentType;
  const from = SOURCE_PLAIN[event.source] ?? event.source;
  const trust = TRUST_PLAIN[event.trust] ?? event.trust;

  return (
    <div className="rise-in">
      <Link href="/playground" className="text-lg font-bold text-link hover:underline">
        ← Back to the Playground
      </Link>

      <h1 className="mt-5 text-5xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-6xl">Event detail</h1>
      <p className="mt-2 break-all font-mono text-[15px] text-ink-dim">{event.id}</p>

      <div className="mt-8 space-y-8">
        <VerdictBanner decision={event.action} finalBand={event.finalBand} score={event.score} attackTypes={attackTypes} />

        <section className={card}>
          <h2 className={heading}>What was checked</h2>
          <p className="mt-2 text-lg text-ink-dim">
            {kind}, from {from}. The source is {trust}.
          </p>
          <p className="mt-4 whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl border border-line bg-canvas p-5 font-mono text-[16px] leading-relaxed text-ink">
            {event.contentExcerpt}
          </p>
        </section>

        <section className={card}>
          <h2 className={heading}>Why this decision</h2>
          <p className="mt-3 text-xl leading-relaxed text-ink">{event.reason}</p>
          <p className="mt-2 font-mono text-[15px] text-ink-dim">Policy rule {event.policyRuleId}</p>
        </section>

        <section>
          <h2 className={heading}>What we found</h2>
          <div className="mt-5">
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
        </section>

        {event.verdict && <VerdictCard verdict={event.verdict.verdict} steps={event.verdict.steps} />}

        <ScoreBreakdown score={event.score} band={event.finalBand} contributions={event.contributions} />

        {event.toolCalls.length > 0 && (
          <section>
            <h2 className={heading}>What the guard decided</h2>
            <div className="mt-5 space-y-4">
              {event.toolCalls.map((call, i) => (
                <div key={i} className="rounded-3xl border border-line bg-surface p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-2xl font-bold text-ink">{TOOL_PLAIN[call.tool] ?? call.tool}</span>
                    <GuardBadge outcome={call.outcome} />
                  </div>
                  {call.checks.length > 0 && (
                    <ul className="mt-4 space-y-2 text-[17px]">
                      {call.checks.map((check) => (
                        <li key={check.checkId} className="flex gap-2">
                          <span className={check.passed ? "text-[color:var(--band-low)]" : "text-[color:var(--band-critical)]"} aria-label={check.passed ? "passed" : "failed"}>
                            {check.passed ? "✓" : "✗"}
                          </span>
                          <span>
                            <b>{check.checkId}</b> {CHECK_PLAIN[check.checkId] ?? ""} <span className="text-ink-dim">{check.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[15px] text-ink-dim">
          {Object.entries(event.timings).map(([stage, ms]) => (
            <span key={stage}>
              {stage}: {ms.toFixed(2)}ms
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
