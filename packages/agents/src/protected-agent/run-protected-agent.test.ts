import { describe, expect, it } from "vitest";
import { ScriptedGateway, toolCall } from "../investigator/test-support.js";
import { runProtectedAgent, type ProtectedAgentDeps } from "./run-protected-agent.js";
import { SEEDED_INBOX } from "./seeded-inbox.js";

function finalResponse(id: string, message: string) {
  return toolCall(id, "final_response", { message });
}

function deps(overrides: Partial<ProtectedAgentDeps> = {}): ProtectedAgentDeps {
  return {
    getInbox: async () => SEEDED_INBOX,
    getSecret: async () => null,
    ...overrides,
  };
}

function baseRequest(overrides: Record<string, unknown> = {}) {
  return { instruction: "test instruction", sessionId: "session-1", deps: deps(), knownSecrets: [], ...overrides };
}

describe("runProtectedAgent", () => {
  it("sends an email to an allow-listed address when the user asks", async () => {
    const gateway = new ScriptedGateway([
      toolCall("c1", "send_email", { to: "reviewer@hifz-demo.test", subject: "Hi", body: "Hello there." }),
      finalResponse("c2", "Sent your email."),
    ]);

    const result = await runProtectedAgent(gateway, baseRequest());

    expect(result.llmStatus).toBe("ok");
    expect(result.finalMessage).toBe("Sent your email.");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({ tool: "send_email", guardOutcome: "EXECUTE" });
  });

  it("blocks send_email to a destination outside the allowlist", async () => {
    const gateway = new ScriptedGateway([
      toolCall("c1", "send_email", { to: "someone@external.example", subject: "Hi", body: "Hello." }),
      finalResponse("c2", "Done."),
    ]);

    const result = await runProtectedAgent(gateway, baseRequest());
    expect(result.toolCalls[0]).toMatchObject({ tool: "send_email", guardOutcome: "REQUIRE_APPROVAL" });
  });

  it("reads the inbox, scores each email for real, and lets the agent summarize a legitimate one", async () => {
    const gateway = new ScriptedGateway([
      toolCall("c1", "read_inbox", {}),
      toolCall("c2", "summarize", { text: "Sprint planning moved to 3pm" }),
      finalResponse("c3", "Your inbox has a sprint planning update."),
    ]);

    const result = await runProtectedAgent(gateway, baseRequest());
    expect(result.llmStatus).toBe("ok");
    expect(result.toolCalls.map((c) => c.tool)).toEqual(["read_inbox", "summarize"]);
    expect(result.toolCalls.every((c) => c.guardOutcome === "EXECUTE")).toBe(true);
  });

  it("requires approval when a hidden-instruction attack email leads the model to propose sending mail to an allow-listed address", async () => {
    // inbox-004 has a display:none injection telling the assistant to forward credentials.
    // Even if the recipient happens to be on the allowlist, the content is untrusted and
    // this is a non-low-risk tool -> G5 should require approval.
    const gateway = new ScriptedGateway([
      toolCall("c1", "read_inbox", {}),
      toolCall("c2", "send_email", { to: "reviewer@hifz-demo.test", subject: "Fwd", body: "forwarding as requested" }),
      finalResponse("c3", "Done."),
    ]);

    const result = await runProtectedAgent(gateway, baseRequest());
    const sendEmailCall = result.toolCalls.find((c) => c.tool === "send_email")!;
    expect(sendEmailCall.guardOutcome).toBe("REQUIRE_APPROVAL");
    expect(sendEmailCall.guardReason).toContain("G5");
  });

  it("blocks read_secrets after reading untrusted inbox content", async () => {
    const gateway = new ScriptedGateway([
      toolCall("c1", "read_inbox", {}),
      toolCall("c2", "read_secrets", { name: "db_password" }),
      finalResponse("c3", "Done."),
    ]);

    const result = await runProtectedAgent(gateway, baseRequest());
    const secretsCall = result.toolCalls.find((c) => c.tool === "read_secrets")!;
    expect(secretsCall.guardOutcome).toBe("BLOCK");
  });

  it("allows read_secrets when no untrusted content has been read yet", async () => {
    const gateway = new ScriptedGateway([
      toolCall("c1", "read_secrets", { name: "db_password" }),
      finalResponse("c2", "Here you go."),
    ]);

    const result = await runProtectedAgent(gateway, baseRequest({ deps: deps({ getSecret: async () => "hifz-demo-password" }) }));
    expect(result.toolCalls[0]).toMatchObject({ tool: "read_secrets", guardOutcome: "EXECUTE" });
  });

  it("blocks an outbound value that matches a known fake secret even from a clean session", async () => {
    const gateway = new ScriptedGateway([
      toolCall("c1", "send_email", { to: "reviewer@hifz-demo.test", subject: "Password", body: "It's hifz-demo-password" }),
      finalResponse("c2", "Sent."),
    ]);

    const result = await runProtectedAgent(gateway, baseRequest({ knownSecrets: ["hifz-demo-password"] }));
    expect(result.toolCalls[0]).toMatchObject({ tool: "send_email", guardOutcome: "BLOCK" });
  });

  it("rate-limits after more than 3 high-risk call attempts in one run", async () => {
    const calls = Array.from({ length: 4 }, (_, i) =>
      toolCall(`c${i}`, "send_email", { to: `user${i}@hifz-demo.test`, subject: "s", body: "b" }),
    );
    const gateway = new ScriptedGateway([...calls, finalResponse("c-final", "done")]);

    const result = await runProtectedAgent(gateway, baseRequest());
    const outcomes = result.toolCalls.map((c) => c.guardOutcome);
    expect(outcomes.slice(0, 3)).toEqual(["EXECUTE", "EXECUTE", "EXECUTE"]);
    expect(outcomes[3]).toBe("REQUIRE_APPROVAL"); // the 4th high-risk call trips G6
  });

  it("ends the turn on a plain-text reply even without final_response", async () => {
    const gateway = new ScriptedGateway([{ kind: "no_tool_call", text: "I don't need any tools for that." }]);
    const result = await runProtectedAgent(gateway, baseRequest());
    expect(result.llmStatus).toBe("ok");
    expect(result.finalMessage).toBe("I don't need any tools for that.");
  });

  it("maps a thrown gateway error to llmStatus 'unavailable'", async () => {
    const gateway = new ScriptedGateway([new Error("timed out")]);
    const result = await runProtectedAgent(gateway, baseRequest());
    expect(result.llmStatus).toBe("unavailable");
    expect(result.finalMessage).toBeNull();
  });
});
