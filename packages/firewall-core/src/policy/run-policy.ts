import { bandAtLeast } from "../band.js";
import { normalize } from "../normalize/normalize.js";
import { runDetectors } from "../detect/detect.js";
import { scoreRisk } from "../scorer.js";
import type { NormalizedContent, PolicyAction, RiskBand, Signal, TrustLevel } from "../types.js";
import { decidePolicy } from "./decide-policy.js";
import { sanitizeContent } from "./sanitize.js";

export interface RunPolicyInput {
  finalBand: RiskBand;
  sourceTrust: TrustLevel;
  failSafeAction: PolicyAction | null;
  /** The normalized content and signals the policy decision was based on — only read when the decision is SANITIZE. */
  normalized: NormalizedContent;
  signals: Signal[];
}

export interface RunPolicyResult {
  action: PolicyAction;
  policyRuleId: string;
  reason: string;
  sanitizedContent: string | null;
}

/**
 * Ties decidePolicy (the 6 ordered rules) to sanitization when POL-005
 * fires (docs/architecture/LLD.md §3.7): redact, then re-scan the
 * sanitized text once — if it still scores >= MEDIUM, the sanitization
 * didn't work and the case escalates to BLOCK instead.
 */
export function runPolicy(input: RunPolicyInput): RunPolicyResult {
  const decision = decidePolicy({
    finalBand: input.finalBand,
    sourceTrust: input.sourceTrust,
    failSafeAction: input.failSafeAction,
  });

  if (decision.action !== "SANITIZE") {
    return { ...decision, sanitizedContent: null };
  }

  const { sanitizedText } = sanitizeContent(input.normalized, input.signals);

  const rescanNormalized = normalize({ visibleText: sanitizedText, hiddenSegments: [] });
  const rescanSignals = runDetectors(rescanNormalized);
  const rescanAssessment = scoreRisk({ signals: rescanSignals, sourceTrust: input.sourceTrust, sessionRisk: 0 });

  if (bandAtLeast(rescanAssessment.band, "MEDIUM")) {
    return {
      action: "BLOCK",
      policyRuleId: "POL-005",
      reason: `sanitized output still scored ${rescanAssessment.band} on re-scan`,
      sanitizedContent: sanitizedText,
    };
  }

  return { ...decision, sanitizedContent: sanitizedText };
}
