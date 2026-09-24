import { describe, expect, it } from "vitest";
import { scoreRisk } from "./scorer.js";
import type { Signal } from "./types.js";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    detectorId: "OVR-001",
    attackType: "instruction_override",
    severity: "high",
    confidence: 1,
    evidence: [{ start: 0, end: 10, excerpt: "ignore all", layer: "visible" }],
    ...overrides,
  };
}

describe("scoreRisk", () => {
  it("returns LOW / 0 when there are no signals", () => {
    const result = scoreRisk({ signals: [], sourceTrust: "untrusted", sessionRisk: 0 });
    expect(result).toEqual({ score: 0, band: "LOW", contributions: [], signals: [] });
  });

  it("scores a single high-severity signal on trusted, visible text with no session risk", () => {
    const result = scoreRisk({
      signals: [signal({ attackType: "role_change" })],
      sourceTrust: "trusted",
      sessionRisk: 0,
    });
    // base[high]=70 * confidence 1 = 70; no corroboration, no layer bump,
    // no trust bump (trusted), no session bump.
    expect(result.score).toBe(70);
    expect(result.band).toBe("HIGH");
  });

  it("adds a layer adjustment when the top signal is in a hidden segment", () => {
    const result = scoreRisk({
      signals: [signal({ evidence: [{ start: 0, end: 5, excerpt: "hidden", layer: "hidden" }] })],
      sourceTrust: "trusted",
      sessionRisk: 0,
    });
    expect(result.score).toBe(80); // 70 + layerAdjustment 10
  });

  it("adds a trust adjustment for untrusted sources with instruction-like signals", () => {
    const result = scoreRisk({
      signals: [signal()],
      sourceTrust: "untrusted",
      sessionRisk: 0,
    });
    expect(result.score).toBe(80); // 70 + trustAdjustment 10
  });

  it("caps corroboration at +16 regardless of how many extra attack types appear", () => {
    const signals = [
      signal({ attackType: "instruction_override" }),
      signal({ detectorId: "ROL-001", attackType: "role_change", severity: "low", confidence: 1 }),
      signal({ detectorId: "SEC-001", attackType: "secret_extraction", severity: "low", confidence: 1 }),
      signal({ detectorId: "TOL-001", attackType: "tool_abuse", severity: "low", confidence: 1 }),
    ];
    const result = scoreRisk({ signals, sourceTrust: "trusted", sessionRisk: 0 });
    const corroboration = result.contributions.find((c) => c.factor === "corroboration");
    expect(corroboration?.points).toBe(16);
  });

  it("clamps the final score at 100", () => {
    const result = scoreRisk({
      signals: [
        signal({ severity: "critical" }),
        signal({ detectorId: "ROL-001", attackType: "role_change", severity: "critical" }),
        signal({ detectorId: "SEC-001", attackType: "secret_extraction", severity: "critical" }),
        signal({
          detectorId: "TOL-001",
          attackType: "tool_abuse",
          severity: "critical",
          evidence: [{ start: 0, end: 5, excerpt: "x", layer: "hidden" }],
        }),
      ],
      sourceTrust: "untrusted",
      sessionRisk: 100,
    });
    expect(result.score).toBe(100);
    expect(result.band).toBe("CRITICAL");
  });
});
