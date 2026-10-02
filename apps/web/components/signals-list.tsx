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
    return <p className="text-[13px] text-ink-faint">No rule detectors fired on this content.</p>;
  }

  return (
    <div className="space-y-2">
      {signals.map((signal, i) => (
        <div key={`${signal.detectorId}-${i}`} className="rounded-lg border border-line bg-surface p-3.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <span className="font-mono text-ink-dim">{signal.detectorId}</span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink-dim">{signal.attackType.replace(/_/g, " ")}</span>
            <span className="text-ink-faint">·</span>
            <span className={`${SEVERITY_STYLES[signal.severity] ?? "text-ink-dim"} font-medium uppercase tracking-wide`}>
              {signal.severity}
            </span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink-faint">{Math.round(signal.confidence * 100)}%</span>
          </div>
          {signal.evidence.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {signal.evidence.map((span, j) => (
                <mark
                  key={j}
                  className="max-w-full break-words [overflow-wrap:anywhere] rounded border border-[color:var(--band-medium)]/25 bg-[color:var(--band-medium)]/10 px-1.5 py-0.5 font-mono text-[11px] text-[color:var(--band-medium)]"
                  title={`layer: ${span.layer}`}
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
