import { describe, expect, it } from "vitest";
import { decidePolicy } from "./decide-policy.js";

describe("decidePolicy", () => {
  it("POL-001: BLOCKs a CRITICAL band regardless of trust", () => {
    const result = decidePolicy({ finalBand: "CRITICAL", sourceTrust: "untrusted", failSafeAction: null });
    expect(result).toMatchObject({ action: "BLOCK", policyRuleId: "POL-001" });
  });

  it("POL-002: BLOCKs a HIGH band from an untrusted source", () => {
    const result = decidePolicy({ finalBand: "HIGH", sourceTrust: "untrusted", failSafeAction: null });
    expect(result).toMatchObject({ action: "BLOCK", policyRuleId: "POL-002" });
  });

  it("POL-003: REVIEWs a HIGH band from a semi-trusted source", () => {
    const result = decidePolicy({ finalBand: "HIGH", sourceTrust: "semi_trusted", failSafeAction: null });
    expect(result).toMatchObject({ action: "REVIEW", policyRuleId: "POL-003" });
  });

  it("POL-004: defers to the fail-safe action when the LLM didn't weigh in, ahead of every band rule", () => {
    const result = decidePolicy({ finalBand: "CRITICAL", sourceTrust: "untrusted", failSafeAction: "BLOCK" });
    expect(result).toMatchObject({ action: "BLOCK", policyRuleId: "POL-004" });

    const reviewCase = decidePolicy({ finalBand: "LOW", sourceTrust: "untrusted", failSafeAction: "REVIEW" });
    expect(reviewCase).toMatchObject({ action: "REVIEW", policyRuleId: "POL-004" });
  });

  it("POL-005: SANITIZEs a MEDIUM band", () => {
    const result = decidePolicy({ finalBand: "MEDIUM", sourceTrust: "untrusted", failSafeAction: null });
    expect(result).toMatchObject({ action: "SANITIZE", policyRuleId: "POL-005" });
  });

  it("POL-006: ALLOWs a LOW band", () => {
    const result = decidePolicy({ finalBand: "LOW", sourceTrust: "untrusted", failSafeAction: null });
    expect(result).toMatchObject({ action: "ALLOW", policyRuleId: "POL-006" });
  });

  it("POL-006: also falls through to ALLOW for the HIGH+trusted gap the table leaves uncovered", () => {
    const result = decidePolicy({ finalBand: "HIGH", sourceTrust: "trusted", failSafeAction: null });
    expect(result).toMatchObject({ action: "ALLOW", policyRuleId: "POL-006" });
  });
});
