import type { InvestigatorVerdict } from "@hifz/firewall-core";
import { BandBadge } from "./badges.js";

/** Investigator plan trace (LLD §10, Event detail screen). */
export function VerdictCard({ verdict, steps }: { verdict: InvestigatorVerdict; steps?: string[] }) {
  const stepsTaken = steps && steps.length > 0 ? steps : verdict.stepsTaken;

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-medium uppercase tracking-wide text-ink-faint">Investigator verdict</div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[15px] text-ink-faint">{verdict.modelTag}</span>
          <BandBadge band={verdict.band} />
        </div>
      </div>

      <p className="mt-3 text-[18px] leading-relaxed text-ink-dim">{verdict.rationale}</p>

      {stepsTaken.length > 0 && (
        <ol className="mt-4 space-y-1.5 border-l border-line pl-4 text-[16px] text-ink-faint">
          {stepsTaken.map((step, i) => (
            <li
              key={i}
              className="relative before:absolute before:-left-[19px] before:top-1.5 before:h-1.5 before:w-1.5 before:rounded-full before:bg-accent"
            >
              {step}
            </li>
          ))}
        </ol>
      )}

      {verdict.evidence.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {verdict.evidence.map((span, i) => (
            <mark
              key={i}
              className="rounded border border-[color:var(--band-medium)]/25 bg-[color:var(--band-medium)]/10 px-1.5 py-0.5 font-mono text-[15px] text-[color:var(--band-medium)]"
              title={`layer: ${span.layer}`}
            >
              {span.excerpt}
            </mark>
          ))}
        </div>
      )}
    </div>
  );
}
