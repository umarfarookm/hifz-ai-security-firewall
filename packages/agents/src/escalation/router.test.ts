import { describe, expect, it } from "vitest";
import { decideEscalation } from "./router.js";

const BAND = { min: 20, max: 70 };

describe("decideEscalation", () => {
  it("skips low scores below the escalation band", () => {
    expect(decideEscalation(0, BAND)).toBe("skip_low");
    expect(decideEscalation(19, BAND)).toBe("skip_low");
  });

  it("routes scores inside the escalation band to investigation", () => {
    expect(decideEscalation(20, BAND)).toBe("investigate");
    expect(decideEscalation(45, BAND)).toBe("investigate");
    expect(decideEscalation(69, BAND)).toBe("investigate");
  });

  it("skips high scores at or above the escalation band — no LLM needed to block", () => {
    expect(decideEscalation(70, BAND)).toBe("skip_high");
    expect(decideEscalation(100, BAND)).toBe("skip_high");
  });
});
