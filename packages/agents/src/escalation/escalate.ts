import type { InvestigatorVerdict, LlmStatus, PolicyAction, RiskAssessment, RiskBand } from "@hifz/firewall-core";
import type { ModelGateway } from "../model-gateway.js";
import type { InvestigateRequest } from "../investigator/investigate.js";
import { investigate } from "../investigator/investigate.js";
import { applyFailSafeOverride } from "./fail-safe.js";
import type { EscalationBand } from "./router.js";
import { decideEscalation } from "./router.js";

const BAND_ORDER: RiskBand[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** The investigator can only raise a band, never lower one (P1). */
function mergeBand(ruleBand: RiskBand, verdictBand: RiskBand): RiskBand {
  return BAND_ORDER.indexOf(verdictBand) > BAND_ORDER.indexOf(ruleBand) ? verdictBand : ruleBand;
}

export interface RunEscalationParams {
  riskAssessment: RiskAssessment;
  escalationBand: EscalationBand;
  /** null when the configured provider for this role is "none" — rules-only mode. */
  gateway: ModelGateway | null;
  investigatorRequest: Omit<InvestigateRequest, "signals">;
  failureMode?: "review" | "block";
}

export interface EscalationResult {
  finalBand: RiskBand;
  llmStatus: LlmStatus;
  verdict: InvestigatorVerdict | null;
  /** Set only when the fail-safe rule (POL-004) fires; null means "defer to the normal policy engine." */
  failSafeAction: PolicyAction | null;
  stepsTaken: string[];
}

/**
 * Ties together the escalation router (§3.5), the investigator agent
 * (§3.6), and the fail-safe override (§3.7 POL-004). This is the single
 * entry point the API route (task 2.9) calls between scoring and policy.
 */
export async function runEscalation(params: RunEscalationParams): Promise<EscalationResult> {
  const { riskAssessment, escalationBand, gateway, failureMode = "review" } = params;
  const decision = decideEscalation(riskAssessment.score, escalationBand);

  if (decision !== "investigate") {
    // Score decided the outcome directly — no LLM needed either way.
    return { finalBand: riskAssessment.band, llmStatus: "not_called", verdict: null, failSafeAction: null, stepsTaken: [] };
  }

  if (gateway === null) {
    // In the escalation band, but this role is configured as rules-only.
    const failSafeAction = applyFailSafeOverride(riskAssessment.band, "not_called", failureMode);
    return { finalBand: riskAssessment.band, llmStatus: "not_called", verdict: null, failSafeAction, stepsTaken: [] };
  }

  const { verdict, llmStatus, stepsTaken } = await investigate(gateway, {
    ...params.investigatorRequest,
    signals: riskAssessment.signals,
  });

  const finalBand = verdict ? mergeBand(riskAssessment.band, verdict.band) : riskAssessment.band;
  const failSafeAction = applyFailSafeOverride(riskAssessment.band, llmStatus, failureMode);

  return { finalBand, llmStatus, verdict, failSafeAction, stepsTaken };
}
