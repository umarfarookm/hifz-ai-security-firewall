import { describe, expect, it } from "vitest";
import type { ModelGateway, ModelGatewayMetadata, StructuredOutputRequest, StructuredOutputResult, ToolTurnRequest, ToolTurnResult } from "@hifz/agents";
import { ThrottledGateway } from "./throttled-gateway.js";

class FakeGateway implements ModelGateway {
  readonly metadata: ModelGatewayMetadata = { provider: "gemini", model: "fake" };
  calls = 0;
  constructor(private readonly failWith?: Error) {}
  async generateStructured<T>(_r: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> {
    throw new Error("not used");
  }
  async runToolTurn(_r: ToolTurnRequest): Promise<ToolTurnResult> {
    this.calls++;
    if (this.failWith) throw this.failWith;
    return { kind: "text", text: "ok" } as unknown as ToolTurnResult;
  }
}

const request = { system: "s", prompt: "p", tools: [], history: [] } satisfies ToolTurnRequest;

describe("ThrottledGateway", () => {
  it("spaces consecutive requests at least minIntervalMs apart", async () => {
    let clock = 1_000;
    const sleeps: number[] = [];
    const gateway = new ThrottledGateway(new FakeGateway(), 5_000, async (ms) => {
      sleeps.push(ms);
      clock += ms;
    }, () => clock);

    await gateway.runToolTurn(request); // first request goes straight through
    await gateway.runToolTurn(request);
    await gateway.runToolTurn(request);

    expect(sleeps).toEqual([5_000, 5_000]);
  });

  it("does not sleep when enough time has already passed", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const gateway = new ThrottledGateway(new FakeGateway(), 5_000, async (ms) => void sleeps.push(ms), () => clock);
    await gateway.runToolTurn(request);
    clock += 10_000;
    await gateway.runToolTurn(request);
    expect(sleeps).toEqual([]);
  });

  it("records the failure reason, still rethrows, and passes metadata through", async () => {
    const gateway = new ThrottledGateway(new FakeGateway(new Error("429 Too Many Requests: quota exceeded")), 0, async () => {}, () => 0);
    await expect(gateway.runToolTurn(request)).rejects.toThrow(/429/);
    await expect(gateway.runToolTurn(request)).rejects.toThrow(/429/);
    expect([...gateway.failures.entries()]).toEqual([["429 Too Many Requests: quota exceeded", 2]]);
    expect(gateway.metadata.model).toBe("fake");
  });
});
