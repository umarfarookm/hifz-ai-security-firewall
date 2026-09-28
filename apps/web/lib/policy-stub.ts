import type { PolicyAction, RiskBand, TrustLevel } from "@hifz/firewall-core";

/**
 * [STUB — pending task 2.3] This is NOT the real policy engine. The real
 * one (docs/architecture/LLD.md §3.7, policies/policy.yaml, 6 ordered
 * rules incl. sanitization + re-scan) is Sheerin's task 2.3, not started
 * yet. This stub exists only so POST /inspect can return a real decision
 * today instead of nothing.
 *
 * Deliberately safe rather than complete: since sanitization isn't
 * implemented, MEDIUM-band content gets REVIEW here instead of the real
 * POL-005's SANITIZE — claiming a SANITIZE action with no sanitization
 * logic behind it would violate "no diagram/doc may describe a component
 * that isn't implemented" (CLAUDE.md). Every rule id here is prefixed
 * "STUB-" specifically so it's never confused with a real POL-* id once
 * 2.3 lands and both exist in the audit history.
 */
export interface StubPolicyInput {
  finalBand: RiskBand;
  trust: TrustLevel;
  /** Already computed by runEscalation (POL-004) — null means "defer to the normal rules below." */
  failSafeAction: PolicyAction | null;
}

export interface StubPolicyResult {
  action: PolicyAction;
  policyRuleId: string;
  reason: string;
}

export function decideStubPolicy(input: StubPolicyInput): StubPolicyResult {
  if (input.failSafeAction) {
    return {
      action: input.failSafeAction,
      policyRuleId: "STUB-004",
      reason: "LLM did not weigh in on a case that needed it (POL-004 equivalent)",
    };
  }

  if (input.finalBand === "CRITICAL") {
    return { action: "BLOCK", policyRuleId: "STUB-001", reason: "finalBand is CRITICAL" };
  }

  if (input.finalBand === "HIGH") {
    return input.trust === "untrusted"
      ? { action: "BLOCK", policyRuleId: "STUB-002", reason: "finalBand is HIGH and the source is untrusted" }
      : { action: "REVIEW", policyRuleId: "STUB-003", reason: "finalBand is HIGH and the source is semi-trusted" };
  }

  if (input.finalBand === "MEDIUM") {
    return {
      action: "REVIEW",
      policyRuleId: "STUB-005",
      reason: "finalBand is MEDIUM — the real policy (task 2.3) would SANITIZE; this stub uses REVIEW since sanitization isn't implemented yet",
    };
  }

  return { action: "ALLOW", policyRuleId: "STUB-006", reason: "finalBand is LOW" };
}
