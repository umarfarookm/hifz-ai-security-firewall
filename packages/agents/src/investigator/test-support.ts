import type { ModelGateway, ModelGatewayMetadata, StructuredOutputRequest, StructuredOutputResult, ToolTurnRequest } from "../model-gateway.js";
import type { ToolTurnResult } from "../tool-types.js";
import type { InvestigatorTools } from "./tools.js";

/**
 * A scripted ModelGateway for tests — returns a pre-programmed sequence of
 * ToolTurnResults, one per call to runToolTurn, so investigate()'s loop
 * logic can be tested without any real network call.
 */
export class ScriptedGateway implements ModelGateway {
  readonly metadata: ModelGatewayMetadata = { provider: "gemini", model: "test-model" };
  private callIndex = 0;
  public readonly requestsSeen: ToolTurnRequest[] = [];

  constructor(private readonly script: (ToolTurnResult | Error)[]) {}

  async generateStructured<T>(_request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> {
    throw new Error("ScriptedGateway does not implement generateStructured — use runToolTurn in these tests.");
  }

  async runToolTurn(request: ToolTurnRequest): Promise<ToolTurnResult> {
    this.requestsSeen.push(request);
    const next = this.script[this.callIndex];
    this.callIndex++;
    if (next === undefined) {
      throw new Error(`ScriptedGateway ran out of scripted responses at call ${this.callIndex}`);
    }
    if (next instanceof Error) throw next;
    return next;
  }
}

export function submitVerdictCall(id: string, args: Record<string, unknown>): ToolTurnResult {
  return { kind: "tool_calls", calls: [{ id, name: "submit_verdict", argsJson: JSON.stringify(args) }] };
}

export function toolCall(id: string, name: string, args: Record<string, unknown>): ToolTurnResult {
  return { kind: "tool_calls", calls: [{ id, name, argsJson: JSON.stringify(args) }] };
}

export function validVerdictArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isInjection: true,
    attackTypes: ["instruction_override"],
    band: "HIGH",
    rationale: "The content asks the assistant to ignore its instructions.",
    evidence: [{ start: 0, end: 5, excerpt: "hello", layer: "visible" }],
    stepsTaken: ["Reviewed the signals provided."],
    ...overrides,
  };
}

export function stubTools(overrides: Partial<InvestigatorTools> = {}): InvestigatorTools {
  return {
    decode: async () => ({ encoding: null, decoded: null }),
    rescan: async () => ({ signals: [] }),
    getSessionHistory: async () => [],
    getSourceProfile: async () => ({ trust: "untrusted", priorIncidentCount: 0 }),
    ...overrides,
  };
}
