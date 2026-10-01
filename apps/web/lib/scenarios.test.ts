import { describe, expect, it } from "vitest";
import type { ModelGateway, ModelGatewayMetadata, StructuredOutputRequest, StructuredOutputResult, ToolTurnRequest, ToolTurnResult } from "@hifz/agents";
import { InMemoryAuditWriter } from "./audit.js";
import { InMemoryReviewStore } from "./review-store.js";
import { runInspection } from "./inspect.js";
import { SCENARIOS, findScenario } from "./scenarios.js";

class NoneGateway implements ModelGateway {
  readonly metadata: ModelGatewayMetadata = { provider: "none", model: "none" };
  async generateStructured<T>(_r: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> {
    throw new Error("not used");
  }
  async runToolTurn(_r: ToolTurnRequest): Promise<ToolTurnResult> {
    throw new Error("not used");
  }
}

const COMMITTED_TYPES = [
  "instruction_override",
  "role_change",
  "secret_extraction",
  "tool_abuse",
  "credential_theft",
  "encoded_instructions",
  "indirect_prompt_injection",
];

describe("scenarios", () => {
  it("has exactly one scenario per committed attack type, with unique ids", () => {
    expect(SCENARIOS.map((s) => s.attackType).sort()).toEqual([...COMMITTED_TYPES].sort());
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  it("findScenario resolves by id and returns undefined for unknown ids", () => {
    expect(findScenario("tool-abuse")?.attackType).toBe("tool_abuse");
    expect(findScenario("nope")).toBeUndefined();
  });

  // Rules-only (provider "none"): proves the shipped payloads are caught by the deterministic layer alone,
  // independent of any LLM, and are attributed to the attack type they claim to demonstrate.
  it.each(SCENARIOS)("$id is flagged as $attackType by the rules alone", async (scenario) => {
    const audit = new InMemoryAuditWriter();
    const outcome = await runInspection(scenario.request, {
      audit,
      reviews: new InMemoryReviewStore(audit),
      gateway: new NoneGateway(),
      escalationBand: { min: 20, max: 70 },
      failureMode: "review",
      detectorVersion: "test-v1",
      sessionRiskDecayMinutes: 30,
      investigatorTimeoutMs: 20_000,
      investigatorTemperature: 0,
      investigatorMaxRetries: 1,
    });
    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") return;
    expect(outcome.body.decision).not.toBe("ALLOW");
    expect(outcome.body.attackTypes).toContain(scenario.attackType);
  });
});
