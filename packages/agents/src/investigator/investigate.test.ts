import { describe, expect, it } from "vitest";
import { investigate } from "./investigate.js";
import { InMemoryVerdictCache } from "./cache.js";
import { ScriptedGateway, stubTools, submitVerdictCall, toolCall, validVerdictArgs } from "./test-support.js";
import type { Signal } from "@hifz/firewall-core";

const NO_SIGNALS: Signal[] = [];

function baseRequest(overrides: Partial<Parameters<typeof investigate>[1]> = {}) {
  return {
    content: "hello world",
    signals: NO_SIGNALS,
    tools: stubTools(),
    detectorVersion: "v1",
    ...overrides,
  };
}

describe("investigate", () => {
  it("returns ok on a straightforward first-turn submit_verdict", async () => {
    const gateway = new ScriptedGateway([submitVerdictCall("call-1", validVerdictArgs())]);
    const result = await investigate(gateway, baseRequest());

    expect(result.llmStatus).toBe("ok");
    expect(result.verdict?.isInjection).toBe(true);
    expect(result.verdict?.modelTag).toBe("gemini:test-model");
  });

  it("executes investigative tool calls before the model submits its verdict", async () => {
    const rescanCalls: string[] = [];
    const tools = stubTools({
      decode: async (text) => ({ encoding: "base64", decoded: `decoded:${text}` }),
      rescan: async (text) => {
        rescanCalls.push(text);
        return { signals: [] };
      },
    });
    const gateway = new ScriptedGateway([
      toolCall("call-1", "decode", { text: "aGVsbG8=" }),
      toolCall("call-2", "rescan", { text: "decoded:aGVsbG8=" }),
      submitVerdictCall("call-3", validVerdictArgs()),
    ]);

    const result = await investigate(gateway, baseRequest({ tools }));

    expect(result.llmStatus).toBe("ok");
    expect(rescanCalls).toEqual(["decoded:aGVsbG8="]);
    expect(result.stepsTaken).toHaveLength(2);
    expect(result.stepsTaken[0]).toContain("decode(");
  });

  it("retries once on malformed JSON in the verdict args, then succeeds", async () => {
    const gateway = new ScriptedGateway([
      { kind: "tool_calls", calls: [{ id: "call-1", name: "submit_verdict", argsJson: "{not valid json" }] },
      submitVerdictCall("call-2", validVerdictArgs()),
    ]);

    const result = await investigate(gateway, baseRequest());
    expect(result.llmStatus).toBe("ok");
  });

  it("returns invalid_output when the verdict fails schema validation twice", async () => {
    const badArgs = validVerdictArgs({ band: "SEVERE" }); // not a valid enum value
    const gateway = new ScriptedGateway([submitVerdictCall("call-1", badArgs), submitVerdictCall("call-2", badArgs)]);

    const result = await investigate(gateway, baseRequest());
    expect(result.llmStatus).toBe("invalid_output");
    expect(result.verdict).toBeNull();
  });

  it("rejects a verdict whose evidence offsets fall outside the analysed content", async () => {
    const outOfRange = validVerdictArgs({ evidence: [{ start: 0, end: 999, excerpt: "x", layer: "visible" }] });
    const gateway = new ScriptedGateway([submitVerdictCall("call-1", outOfRange), submitVerdictCall("call-2", validVerdictArgs())]);

    const result = await investigate(gateway, baseRequest({ content: "short" }));
    expect(result.llmStatus).toBe("ok"); // second attempt (in-range) succeeds
  });

  it("returns invalid_output when the model never calls a tool at all", async () => {
    const gateway = new ScriptedGateway([
      { kind: "no_tool_call", text: "I refuse to use tools." },
      { kind: "no_tool_call", text: "Still refusing." },
    ]);

    const result = await investigate(gateway, baseRequest());
    expect(result.llmStatus).toBe("invalid_output");
  });

  it("nudges the model to submit once the investigative tool-call budget is exhausted", async () => {
    const gateway = new ScriptedGateway([
      toolCall("c1", "decode", { text: "a" }),
      toolCall("c2", "decode", { text: "b" }),
      toolCall("c3", "decode", { text: "c" }),
      toolCall("c4", "decode", { text: "d" }),
      toolCall("c5", "decode", { text: "e" }), // 5th investigative call — should be refused, not executed
      submitVerdictCall("c6", validVerdictArgs()),
    ]);

    const result = await investigate(gateway, baseRequest());
    expect(result.llmStatus).toBe("ok");
    expect(result.stepsTaken).toHaveLength(4); // only 4 actually executed
  });

  it("maps a thrown gateway error (e.g. a timeout) to llmStatus 'unavailable'", async () => {
    const gateway = new ScriptedGateway([new Error("request timed out")]);
    const result = await investigate(gateway, baseRequest());
    expect(result.llmStatus).toBe("unavailable");
    expect(result.verdict).toBeNull();
  });

  it("serves a cached verdict without calling the gateway again", async () => {
    const cache = new InMemoryVerdictCache();
    const gateway = new ScriptedGateway([submitVerdictCall("call-1", validVerdictArgs())]);

    const first = await investigate(gateway, baseRequest({ cache }));
    expect(first.llmStatus).toBe("ok");

    // A second gateway that would throw if actually called — proves the cache short-circuits.
    const gatewayThatMustNotBeCalled = new ScriptedGateway([new Error("should not be called")]);
    const second = await investigate(gatewayThatMustNotBeCalled, baseRequest({ cache }));
    expect(second.llmStatus).toBe("cached");
    expect(second.verdict?.isInjection).toBe(true);
  });

  it("forwards a configured temperature to the gateway (LLM_TEMPERATURE)", async () => {
    const gateway = new ScriptedGateway([submitVerdictCall("call-1", validVerdictArgs())]);
    await investigate(gateway, baseRequest({ temperature: 0.4 }));
    expect(gateway.requestsSeen[0]?.temperature).toBe(0.4);
  });

  it("omits temperature from the gateway request when not configured", async () => {
    const gateway = new ScriptedGateway([submitVerdictCall("call-1", validVerdictArgs())]);
    await investigate(gateway, baseRequest());
    expect(gateway.requestsSeen[0]?.temperature).toBeUndefined();
  });

  it("respects a configured maxRetries of 0 — no second attempt on invalid output", async () => {
    const badArgs = validVerdictArgs({ band: "SEVERE" }); // not a valid enum value
    const gateway = new ScriptedGateway([submitVerdictCall("call-1", badArgs)]);

    const result = await investigate(gateway, baseRequest({ maxRetries: 0 }));
    expect(result.llmStatus).toBe("invalid_output");
    expect(gateway.requestsSeen).toHaveLength(1); // no retry attempted
  });

  it("uses a different cache key for different content", async () => {
    const cache = new InMemoryVerdictCache();
    const gateway = new ScriptedGateway([submitVerdictCall("call-1", validVerdictArgs()), submitVerdictCall("call-2", validVerdictArgs())]);

    await investigate(gateway, baseRequest({ content: "content A", cache }));
    const second = await investigate(gateway, baseRequest({ content: "content B", cache }));
    expect(second.llmStatus).toBe("ok"); // not a cache hit — the gateway was called again
  });
});
