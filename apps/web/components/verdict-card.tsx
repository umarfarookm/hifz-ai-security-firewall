import type { InvestigatorVerdict } from "@hifz/firewall-core";
import { BandBadge } from "./badges.js";

/** Investigator plan trace (LLD §10, Event detail screen), shown to a reader as a second opinion. */
export function VerdictCard({ verdict, steps }: { verdict: InvestigatorVerdict; steps?: string[] }) {
  const stepsTaken = steps && steps.length > 0 ? steps : verdict.stepsTaken;

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">Second opinion</h2>
          <div className="mt-1 text-[15px] font-bold text-ink-dim">Investigator verdict</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[14px] text-ink-dim">{verdict.modelTag}</span>
          <BandBadge band={verdict.band} />
        </div>
      </div>

      <p className="mt-4 text-lg leading-relaxed text-ink">{verdict.rationale}</p>

      {stepsTaken.length > 0 && (
        <ol className="mt-3 space-y-2 border-l-2 border-line-strong pl-5 text-[15px] text-ink-dim">
          {stepsTaken.map((step, i) => (
            <li key={i} className="relative before:absolute before:-left-[27px] before:top-2 before:h-2.5 before:w-2.5 before:rounded-full before:bg-accent">
              {step}
            </li>
          ))}
        </ol>
      )}

      {verdict.evidence.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {verdict.evidence.map((span, i) => (
            <mark
              key={i}
              className="max-w-full break-words [overflow-wrap:anywhere] rounded-lg border border-[color:var(--band-medium)]/30 bg-[color:var(--band-medium)]/10 px-2.5 py-1 font-mono text-[15px] text-ink"
              title={`found in the ${span.layer} text`}
            >
              {span.excerpt}
            </mark>
          ))}
        </div>
      )}
    </section>
  );
}
