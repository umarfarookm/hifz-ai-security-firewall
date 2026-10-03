import type { RiskBand, ScoreContribution } from "@hifz/firewall-core";
import { BandBadge } from "./badges.js";

const BAND_BAR_COLOR: Record<RiskBand, string> = {
  LOW: "bg-[color:var(--band-low)]",
  MEDIUM: "bg-[color:var(--band-medium)]",
  HIGH: "bg-[color:var(--band-high)]",
  CRITICAL: "bg-[color:var(--band-critical)]",
};

/** What each scoring factor means, in plain words. The raw factor name stays available as the tooltip. */
function plainFactor(factor: string): string {
  if (factor.startsWith("topSignal:")) return `Strongest warning sign (${factor.slice("topSignal:".length)})`;
  switch (factor) {
    case "corroboration":
      return "Other signs backing it up";
    case "layerAdjustment":
      return "Where the text was hidden";
    case "trustAdjustment":
      return "How much we trust the source";
    case "sessionAdjustment":
      return "Earlier suspicious activity";
    default:
      return factor;
  }
}

export function ScoreBreakdown({ score, band, contributions }: { score: number; band: RiskBand; contributions: ScoreContribution[] }) {
  const maxPoints = Math.max(1, ...contributions.map((c) => Math.abs(c.points)));

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-mono text-3xl font-medium tabular-nums text-ink">{score}</div>
          <div className="mt-1 text-[15px] font-bold text-ink-dim">risk score out of 100</div>
        </div>
        <BandBadge band={band} />
      </div>

      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-line" role="img" aria-label={`Risk score ${score} out of 100`}>
        <div className={`h-full rounded-full ${BAND_BAR_COLOR[band]}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>

      {contributions.length > 0 && (
        <div className="mt-4 space-y-3.5 border-t border-line pt-5">
          <div className="text-base font-bold text-ink">Score breakdown</div>
          {contributions.map((c) => (
            <div key={c.factor} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 text-[15px] sm:grid-cols-[240px_minmax(0,1fr)_auto]" title={c.factor}>
              <div className="text-ink">{plainFactor(c.factor)}</div>
              <div className="order-last col-span-2 h-2.5 overflow-hidden rounded-full bg-line sm:order-none sm:col-span-1">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(Math.abs(c.points) / maxPoints) * 100}%` }} />
              </div>
              <div className="w-10 text-right font-mono font-bold tabular-nums text-ink">{c.points}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
