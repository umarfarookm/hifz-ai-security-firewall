import { ATTACK_PLAIN } from "./plain-labels.js";

const SEVERITY_STYLES: Record<string, string> = {
  low: "text-[color:var(--band-low)]",
  medium: "text-[color:var(--band-medium)]",
  high: "text-[color:var(--band-high)]",
  critical: "text-[color:var(--band-critical)]",
};

export interface EvidenceLike {
  excerpt: string;
  layer: string;
}

export interface SignalLike {
  detectorId: string;
  attackType: string;
  severity: string;
  confidence: number;
  evidence: EvidenceLike[];
}

/** Evidence highlights (LLD §10, Playground + Event detail screens). */
export function SignalsList({ signals }: { signals: SignalLike[] }) {
  if (signals.length === 0) {
    return <p className="text-xl text-ink-dim">No rule detectors fired on this content.</p>;
  }

  return (
    <div className="space-y-4">
      {signals.map((signal, i) => (
        <div key={`${signal.detectorId}-${i}`} className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[16px]">
            <span className="font-mono font-bold text-ink">{signal.detectorId}</span>
            <span className="text-ink-faint">·</span>
            <span className="font-bold text-ink">{signal.attackType.replace(/_/g, " ")}</span>
            <span className="text-ink-faint">·</span>
            <span className={`${SEVERITY_STYLES[signal.severity] ?? "text-ink-dim"} font-bold uppercase tracking-wide`}>{signal.severity}</span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink-dim">{Math.round(signal.confidence * 100)}% sure</span>
          </div>
          {ATTACK_PLAIN[signal.attackType] && <p className="mt-2 text-lg text-ink-dim">{ATTACK_PLAIN[signal.attackType]}</p>}
          {signal.evidence.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {signal.evidence.map((span, j) => (
                <mark
                  key={j}
                  className="max-w-full break-words [overflow-wrap:anywhere] rounded-lg border border-[color:var(--band-medium)]/30 bg-[color:var(--band-medium)]/10 px-2.5 py-1 font-mono text-[16px] text-ink"
                  title={`found in the ${span.layer} text`}
                >
                  {span.excerpt}
                </mark>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
