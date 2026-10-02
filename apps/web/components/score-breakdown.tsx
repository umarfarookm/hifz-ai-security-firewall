import type { RiskBand, ScoreContribution } from "@hifz/firewall-core";
import { BandBadge } from "./badges.js";

const BAND_BAR_COLOR: Record<RiskBand, string> = {
  LOW: "bg-[color:var(--band-low)]",
  MEDIUM: "bg-[color:var(--band-medium)]",
  HIGH: "bg-[color:var(--band-high)]",
  CRITICAL: "bg-[color:var(--band-critical)]",
};

export function ScoreBreakdown({ score, band, contributions }: { score: number; band: RiskBand; contributions: ScoreContribution[] }) {
  const maxPoints = Math.max(1, ...contributions.map((c) => Math.abs(c.points)));

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-3xl font-medium tabular-nums text-ink">{score}</div>
          <div className="mt-0.5 text-[15px] uppercase tracking-wide text-ink-faint">risk score</div>
        </div>
        <BandBadge band={band} />
      </div>

      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${BAND_BAR_COLOR[band]}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>

      {contributions.length > 0 && (
        <div className="mt-5 space-y-2.5 border-t border-line pt-4">
          <div className="text-[15px] font-medium uppercase tracking-wide text-ink-faint">Score breakdown</div>
          {contributions.map((c) => (
            <div key={c.factor} className="flex items-center gap-3 text-[18px]">
              <div className="w-40 shrink-0 truncate text-ink-dim">{c.factor}</div>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(Math.abs(c.points) / maxPoints) * 100}%` }} />
              </div>
              <div className="w-8 shrink-0 text-right font-mono tabular-nums text-ink-dim">{c.points}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
