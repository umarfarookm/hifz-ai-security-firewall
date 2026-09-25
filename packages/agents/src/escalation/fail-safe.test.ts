import { describe, expect, it } from "vitest";
import { applyFailSafeOverride } from "./fail-safe.js";

describe("applyFailSafeOverride", () => {
  it("overrides to REVIEW when the LLM was unavailable and the rule band is MEDIUM+", () => {
    expect(applyFailSafeOverride("MEDIUM", "unavailable")).toBe("REVIEW");
    expect(applyFailSafeOverride("HIGH", "unavailable")).toBe("REVIEW");
  });

  it("overrides to REVIEW when the LLM returned invalid output", () => {
    expect(applyFailSafeOverride("MEDIUM", "invalid_output")).toBe("REVIEW");
  });

  it("overrides to REVIEW when the provider is 'none' (not_called) in the escalation band", () => {
    expect(applyFailSafeOverride("MEDIUM", "not_called")).toBe("REVIEW");
  });

  it("honours LLM_FAILURE_MODE=block instead of the review default", () => {
    expect(applyFailSafeOverride("HIGH", "unavailable", "block")).toBe("BLOCK");
  });

  it("never overrides for a LOW rule band, regardless of llmStatus", () => {
    expect(applyFailSafeOverride("LOW", "unavailable")).toBeNull();
    expect(applyFailSafeOverride("LOW", "invalid_output")).toBeNull();
    expect(applyFailSafeOverride("LOW", "not_called")).toBeNull();
  });

  it("never overrides when the LLM actually succeeded or served a cached verdict", () => {
    expect(applyFailSafeOverride("HIGH", "ok")).toBeNull();
    expect(applyFailSafeOverride("HIGH", "cached")).toBeNull();
  });
});
