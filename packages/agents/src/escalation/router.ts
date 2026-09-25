/**
 * Escalation routing per docs/architecture/LLD.md §3.5. The escalation band
 * is [min, max) — configurable via LLM_ESCALATION_BAND_MIN/MAX so it can be
 * calibrated on the tuning split without a code change.
 */
export interface EscalationBand {
  min: number;
  max: number;
}

export type EscalationDecision = "skip_low" | "investigate" | "skip_high";

export function decideEscalation(score: number, band: EscalationBand): EscalationDecision {
  if (score < band.min) return "skip_low";
  if (score >= band.max) return "skip_high";
  return "investigate";
}
