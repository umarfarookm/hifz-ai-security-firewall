import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ModelGateway, ModelGatewayMetadata, StructuredOutputRequest, StructuredOutputResult, ToolTurnRequest, ToolTurnResult } from "@hifz/agents";
import { InMemoryAuditWriter } from "./audit.js";
import { runAgentRun, type RunAgentDeps } from "./agent-run.js";

class NoneGatewayDouble implements ModelGateway {
  readonly metadata: ModelGatewayMetadata = { provider: "none", model: "none" };
  async generateStructured<T>(_r: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> {
    throw new Error("not implemented");
  }
  async runToolTurn(_r: ToolTurnRequest): Promise<ToolTurnResult> {
    throw new Error("not implemented");
  }
}

class ScriptedGateway implements ModelGateway {
  readonly metadata: ModelGatewayMetadata = { provider: "gemini", model: "test-model" };
  private callIndex = 0;
  constructor(private readonly script: ToolTurnResult[]) {}
  async generateStructured<T>(_r: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> {
    throw new Error("not implemented");
  }
  async runToolTurn(_r: ToolTurnRequest): Promise<ToolTurnResult> {
    const next = this.script[this.callIndex];
    this.callIndex++;
    if (!next) throw new Error("ScriptedGateway ran out of scripted responses");
    return next;
  }
}

function baseDeps(overrides: Partial<RunAgentDeps> = {}): RunAgentDeps {
  return {
    audit: new InMemoryAuditWriter(),
    gateway: new ScriptedGateway([{ kind: "no_tool_call", text: "Done, nothing needed doing." }]),
    knownSecrets: {},
    ...overrides,
  };
}

describe("runAgentRun", () => {
  it("rejects a body missing the instruction field", async () => {
    const outcome = await runAgentRun({}, baseDeps());
    expect(outcome.kind).toBe("validation_error");
    if (outcome.kind === "validation_error") {
      expect(outcome.issues.length).toBeGreaterThan(0);
    }
  });

  it("reports llm_unavailable when DEMO_AGENT_PROVIDER is 'none'", async () => {
    const outcome = await runAgentRun({ instruction: "check the inbox" }, baseDeps({ gateway: new NoneGatewayDouble() }));
    expect(outcome.kind).toBe("llm_unavailable");
  });

  it("returns the agent's final message and an empty tool-call log for a no-op instruction", async () => {
    const outcome = await runAgentRun({ instruction: "just say hi" }, baseDeps());
    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.body.finalMessage).toBe("Done, nothing needed doing.");
      expect(outcome.body.toolCalls).toEqual([]);
      expect(outcome.body.llmStatus).toBe("ok");
      expect(outcome.body.sessionId).toBeTruthy();
    }
  });

  it("blocks read_secrets after the agent has read untrusted inbox content, and logs the tool call", async () => {
    const gateway = new ScriptedGateway([
      { kind: "tool_calls", calls: [{ id: "c1", name: "read_inbox", argsJson: "{}" }] },
      { kind: "tool_calls", calls: [{ id: "c2", name: "read_secrets", argsJson: JSON.stringify({ name: "db_password" }) }] },
      { kind: "tool_calls", calls: [{ id: "c3", name: "final_response", argsJson: JSON.stringify({ message: "done" }) }] },
    ]);
    const audit = new InMemoryAuditWriter();
    const outcome = await runAgentRun(
      { instruction: "read the inbox and follow up on anything urgent" },
      baseDeps({ gateway, audit, knownSecrets: { dbPassword: "hifz-demo-password" } }),
    );
    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      const secretsCall = outcome.body.toolCalls.find((c) => c.tool === "read_secrets");
      expect(secretsCall?.guardOutcome).toBe("BLOCK");
    }
    expect(audit.toolCalls.some((c) => c.tool === "read_secrets" && c.outcome === "BLOCK")).toBe(true);
  });

  it("persists the Action Guard's per-check breakdown, not an empty array", async () => {
    const gateway = new ScriptedGateway([
      { kind: "tool_calls", calls: [{ id: "c1", name: "send_email", argsJson: JSON.stringify({ to: "x@external.example", subject: "s", body: "b" }) }] },
      { kind: "tool_calls", calls: [{ id: "c2", name: "final_response", argsJson: JSON.stringify({ message: "done" }) }] },
    ]);
    const audit = new InMemoryAuditWriter();
    await runAgentRun({ instruction: "email someone" }, baseDeps({ gateway, audit }));

    const sendEmailCall = audit.toolCalls.find((c) => c.tool === "send_email");
    expect(sendEmailCall?.checks.length).toBeGreaterThan(0);
  });

  it("persists which seeded emails triggered a tool call, not an empty array", async () => {
    const gateway = new ScriptedGateway([
      { kind: "tool_calls", calls: [{ id: "c1", name: "read_inbox", argsJson: "{}" }] },
      { kind: "tool_calls", calls: [{ id: "c2", name: "read_secrets", argsJson: JSON.stringify({ name: "db_password" }) }] },
      { kind: "tool_calls", calls: [{ id: "c3", name: "final_response", argsJson: JSON.stringify({ message: "done" }) }] },
    ]);
    const audit = new InMemoryAuditWriter();
    await runAgentRun({ instruction: "read the inbox then check secrets" }, baseDeps({ gateway, audit }));

    const secretsCall = audit.toolCalls.find((c) => c.tool === "read_secrets");
    // Seeded-inbox emails have no inspection row: they are content ids, never inspection UUIDs.
    expect(secretsCall?.triggeringInspectionIds).toEqual([]);
    expect(secretsCall?.triggeringContentIds.length).toBeGreaterThan(0);
    expect(secretsCall?.triggeringContentIds.every((id) => id.startsWith("inbox-"))).toBe(true);
  });

  it("seeds G6 from prior tool_calls in the same session, across separate /agent/run calls", async () => {
    const sessionId = randomUUID();
    const audit = new InMemoryAuditWriter();
    await audit.ensureSession(sessionId);
    // Simulate 3 high-risk calls already made in an earlier /agent/run for this session.
    for (let i = 0; i < 3; i++) {
      await audit.writeToolCall({
        sessionId,
        tool: "send_email",
        argsRedacted: {},
        triggeringInspectionIds: [],
        triggeringContentIds: [],
        outcome: "EXECUTE",
        checks: [],
      });
    }

    const gateway = new ScriptedGateway([
      { kind: "tool_calls", calls: [{ id: "c1", name: "send_email", argsJson: JSON.stringify({ to: "x@hifz-demo.test", subject: "s", body: "b" }) }] },
      { kind: "tool_calls", calls: [{ id: "c2", name: "final_response", argsJson: JSON.stringify({ message: "done" }) }] },
    ]);

    const outcome = await runAgentRun({ instruction: "send an email", sessionId }, baseDeps({ gateway, audit }));
    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      // The 4th high-risk call overall (1st in this run, but 4th for the session) should trip G6.
      expect(outcome.body.toolCalls[0]).toMatchObject({ tool: "send_email", guardOutcome: "REQUIRE_APPROVAL" });
    }
  });
});
