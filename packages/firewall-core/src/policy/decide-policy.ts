import type { PolicyAction, RiskBand, TrustLevel } from "../types.js";

/**
 * Stage ⑥ Policy engine (docs/architecture/LLD.md §3.7). Six ordered
 * rules, first match wins. Mirrors policies/policy.yaml — keep the two in
 * sync by hand (see packages/agents/src/protected-agent/tools-registry.ts
 * for the same convention).
 */
export interface PolicyInput {
  finalBand: RiskBand;
  sourceTrust: TrustLevel;
  /**
   * POL-004's condition (llmStatus not_called/unavailable/invalid_output
   * for an escalation-band case with ruleBand >= MEDIUM) is exactly what
   * packages/agents/src/escalation/fail-safe.ts's applyFailSafeOverride
   * already computes — passed in here rather than recomputed, so there's
   * one implementation of the fail-safe condition, not two. `null` means
   * "the LLM did weigh in (or wasn't needed)" — defer to the band-based rules.
   */
  failSafeAction: PolicyAction | null;
}

export interface PolicyDecision {
  action: PolicyAction;
  policyRuleId: string;
  reason: string;
}

export function decidePolicy(input: PolicyInput): PolicyDecision {
  if (input.failSafeAction) {
    return {
      action: input.failSafeAction,
      policyRuleId: "POL-004",
      reason: "the LLM did not weigh in on a case that needed it",
    };
  }

  if (input.finalBand === "CRITICAL") {
    return { action: "BLOCK", policyRuleId: "POL-001", reason: "finalBand is CRITICAL" };
  }

  if (input.finalBand === "HIGH" && input.sourceTrust === "untrusted") {
    return { action: "BLOCK", policyRuleId: "POL-002", reason: "finalBand is HIGH and the source is untrusted" };
  }

  if (input.finalBand === "HIGH" && input.sourceTrust === "semi_trusted") {
    return { action: "REVIEW", policyRuleId: "POL-003", reason: "finalBand is HIGH and the source is semi-trusted" };
  }

  if (input.finalBand === "MEDIUM") {
    return { action: "SANITIZE", policyRuleId: "POL-005", reason: "finalBand is MEDIUM" };
  }

  // Includes the LLD-table gap of finalBand HIGH + trust "trusted" — no
  // rule covers it (POL-002/003 only name untrusted/semi_trusted), so per
  // "first match wins, otherwise ALLOW" it correctly falls through here.
  // Trust today is only ever semi_trusted or untrusted in practice (see
  // trustFor() at the API route layer), so this gap isn't reachable yet.
  return { action: "ALLOW", policyRuleId: "POL-006", reason: "finalBand is LOW" };
}
