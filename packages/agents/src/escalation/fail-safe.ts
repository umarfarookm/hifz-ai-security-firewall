import type { LlmStatus, PolicyAction, RiskBand } from "@hifz/firewall-core";

const BAND_ORDER: RiskBand[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function bandAtLeast(band: RiskBand, min: RiskBand): boolean {
  return BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf(min);
}

/**
 * Principle P4 (fail safe) / policy rule POL-004 (docs/architecture/LLD.md
 * §3.7): if a case landed in the escalation band but the LLM never actually
 * weighed in — unavailable, returned invalid output, or wasn't called at all
 * because the provider is configured as "none" (§3.5) — and the
 * deterministic rules alone already put this at MEDIUM or above, the
 * decision must not silently fall through to ALLOW. `failureMode` is
 * LLM_FAILURE_MODE from env config — "review" by default, "block" for a
 * stricter posture, but never "allow".
 *
 * Only call this for cases the router decided needed investigation — a
 * `not_called` status from a score that never entered the escalation band
 * (e.g. a clean LOW-band case) must not go through this function at all,
 * since it never needed the LLM's opinion in the first place.
 *
 * Returns null when no override applies — the caller defers to the normal
 * policy engine (task 2.3) in that case.
 */
export function applyFailSafeOverride(
  ruleBand: RiskBand,
  llmStatus: LlmStatus,
  failureMode: "review" | "block" = "review",
): PolicyAction | null {
  const llmDidNotWeighIn = llmStatus === "unavailable" || llmStatus === "invalid_output" || llmStatus === "not_called";
  if (llmDidNotWeighIn && bandAtLeast(ruleBand, "MEDIUM")) {
    return failureMode === "block" ? "BLOCK" : "REVIEW";
  }
  return null;
}
