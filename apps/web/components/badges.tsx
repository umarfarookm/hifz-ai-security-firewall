import type { PolicyAction, RiskBand } from "@hifz/firewall-core";

const BAND_DOT: Record<RiskBand, string> = {
  LOW: "bg-[color:var(--band-low)]",
  MEDIUM: "bg-[color:var(--band-medium)]",
  HIGH: "bg-[color:var(--band-high)]",
  CRITICAL: "bg-[color:var(--band-critical)]",
};

const ACTION_DOT: Record<PolicyAction, string> = {
  ALLOW: "bg-[color:var(--band-low)]",
  SANITIZE: "bg-accent",
  REVIEW: "bg-[color:var(--band-medium)]",
  BLOCK: "bg-[color:var(--band-critical)]",
};

const GUARD_DOT: Record<string, string> = {
  EXECUTE: "bg-[color:var(--band-low)]",
  REQUIRE_APPROVAL: "bg-[color:var(--band-medium)]",
  BLOCK: "bg-[color:var(--band-critical)]",
};

function Chip({ dotClassName, children }: { dotClassName: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-dim">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClassName}`} />
      {children}
    </span>
  );
}

export function BandBadge({ band }: { band: RiskBand }) {
  return <Chip dotClassName={BAND_DOT[band]}>{band}</Chip>;
}

export function ActionBadge({ action }: { action: PolicyAction }) {
  return <Chip dotClassName={ACTION_DOT[action]}>{action}</Chip>;
}

export function GuardBadge({ outcome }: { outcome: string }) {
  return <Chip dotClassName={GUARD_DOT[outcome] ?? "bg-ink-faint"}>{outcome.replace("_", " ")}</Chip>;
}
