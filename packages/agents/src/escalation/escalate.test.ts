import { describe, expect, it } from "vitest";
import type { RiskAssessment } from "@hifz/firewall-core";
import { runEscalation } from "./escalate.js";
import { ScriptedGateway, stubTools, submitVerdictCall, validVerdictArgs } from "../investigator/test-support.js";

const ESCALATION_BAND = { min: 20, max: 70 };

function riskAssessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return { score: 45, band: "MEDIUM", contributions: [], signals: [], ...overrides };
}

function investigatorRequest() {
  return { content: "hello world", tools: stubTools(), detectorVersion: "v1" };
}

describe("runEscalation", () => {
  it("skips investigation for a low score and reports not_called with no fail-safe override", async () => {
    const result = await runEscalation({
      riskAssessment: riskAssessment({ score: 5, band: "LOW" }),
      escalationBand: ESCALATION_BAND,
      gateway: new ScriptedGateway([new Error("must not be called")]),
      investigatorRequest: investigatorRequest(),
    });
    expect(result.llmStatus).toBe("not_called");
    expect(result.failSafeAction).toBeNull();
    expect(result.finalBand).toBe("LOW");
  });

  it("skips investigation for a high score — no LLM needed to block", async () => {
    const result = await runEscalation({
      riskAssessment: riskAssessment({ score: 90, band: "CRITICAL" }),
      escalationBand: ESCALATION_BAND,
      gateway: new ScriptedGateway([new Error("must not be called")]),
      investigatorRequest: investigatorRequest(),
    });
    expect(result.llmStatus).toBe("not_called");
    expect(result.failSafeAction).toBeNull();
  });

  it("fails safe to REVIEW when the provider is 'none' but the score is in the escalation band", async () => {
    const result = await runEscalation({
      riskAssessment: riskAssessment({ score: 45, band: "MEDIUM" }),
      escalationBand: ESCALATION_BAND,
      gateway: null,
      investigatorRequest: investigatorRequest(),
    });
    expect(result.llmStatus).toBe("not_called");
    expect(result.failSafeAction).toBe("REVIEW");
  });

  it("merges the investigator's band with the rule band, never lowering it", async () => {
    const gateway = new ScriptedGateway([submitVerdictCall("c1", validVerdictArgs({ band: "CRITICAL" }))]);
    const result = await runEscalation({
      riskAssessment: riskAssessment({ score: 45, band: "MEDIUM" }),
      escalationBand: ESCALATION_BAND,
      gateway,
      investigatorRequest: investigatorRequest(),
    });
    expect(result.llmStatus).toBe("ok");
    expect(result.finalBand).toBe("CRITICAL");
    expect(result.failSafeAction).toBeNull();
  });

  it("keeps the rule band when the investigator's verdict is lower — a hostile downgrade attempt never wins", async () => {
    const gateway = new ScriptedGateway([submitVerdictCall("c1", validVerdictArgs({ band: "LOW", isInjection: false }))]);
    const result = await runEscalation({
      riskAssessment: riskAssessment({ score: 45, band: "MEDIUM" }),
      escalationBand: ESCALATION_BAND,
      gateway,
      investigatorRequest: investigatorRequest(),
    });
    expect(result.finalBand).toBe("MEDIUM");
  });

  it("fails safe to REVIEW when the gateway throws (a timeout) on a MEDIUM+ rule band", async () => {
    const gateway = new ScriptedGateway([new Error("timed out")]);
    const result = await runEscalation({
      riskAssessment: riskAssessment({ score: 45, band: "MEDIUM" }),
      escalationBand: ESCALATION_BAND,
      gateway,
      investigatorRequest: investigatorRequest(),
    });
    expect(result.llmStatus).toBe("unavailable");
    expect(result.failSafeAction).toBe("REVIEW");
    expect(result.finalBand).toBe("MEDIUM"); // unchanged — no verdict to merge in
  });

  it("honours LLM_FAILURE_MODE=block end to end", async () => {
    const result = await runEscalation({
      riskAssessment: riskAssessment({ score: 45, band: "HIGH" }),
      escalationBand: ESCALATION_BAND,
      gateway: null,
      investigatorRequest: investigatorRequest(),
      failureMode: "block",
    });
    expect(result.failSafeAction).toBe("BLOCK");
  });
});
