import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { OpenAiCompatibleGateway } from "./openai-compatible.js";

/** Records the body of each chat-completions request and replies with a canned message. */
function fakeClient(message: Record<string, unknown>) {
  const bodies: Array<Record<string, unknown>> = [];
  const client = {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>) => {
          bodies.push(body);
          return { choices: [{ message }] };
        },
      },
    },
  } as unknown as OpenAI;
  return { client, bodies };
}

const toolRequest = { system: "s", prompt: "p", tools: [], history: [] };

describe("OpenAiCompatibleGateway extraBody", () => {
  it("merges extraBody into tool-turn requests and keeps tool_choice required", async () => {
    const { client, bodies } = fakeClient({ content: "", tool_calls: [{ id: "1", type: "function", function: { name: "t", arguments: "{}" } }] });
    const gateway = new OpenAiCompatibleGateway({ provider: "deepseek", apiKey: "k", model: "m", client, extraBody: { thinking: { type: "disabled" } } });

    const result = await gateway.runToolTurn(toolRequest);

    expect(bodies[0]!.thinking).toEqual({ type: "disabled" });
    expect(bodies[0]!.tool_choice).toBe("required");
    expect(result.kind).toBe("tool_calls");
  });

  it("merges extraBody into structured-output requests", async () => {
    const { client, bodies } = fakeClient({ content: '{"ok":true}' });
    const gateway = new OpenAiCompatibleGateway({ provider: "deepseek", apiKey: "k", model: "m", client, extraBody: { thinking: { type: "disabled" } } });

    const out = await gateway.generateStructured({ system: "s", prompt: "p", schema: z.object({ ok: z.boolean() }) });

    expect(bodies[0]!.thinking).toEqual({ type: "disabled" });
    expect(out.data).toEqual({ ok: true });
  });

  it("sends no extra fields when extraBody is not set (OpenAI/Ollama unchanged)", async () => {
    const { client, bodies } = fakeClient({ content: "" });
    const gateway = new OpenAiCompatibleGateway({ provider: "openai", apiKey: "k", model: "m", client });
    await gateway.runToolTurn(toolRequest);
    expect("thinking" in bodies[0]!).toBe(false);
  });
});
