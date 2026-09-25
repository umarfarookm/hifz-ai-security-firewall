import { type Content, FunctionCallingMode, GoogleGenerativeAI, type Part, SchemaType, type Tool } from "@google/generative-ai";
import type {
  ModelGateway,
  ModelGatewayMetadata,
  StructuredOutputRequest,
  StructuredOutputResult,
  ToolTurnRequest,
} from "../model-gateway.js";
import { InvalidStructuredOutputError } from "../model-gateway.js";
import type { JSONSchemaProperty, ToolDefinition, ToolTurnResult } from "../tool-types.js";
import { parseStructuredOutput } from "./parse-structured-output.js";

function toGeminiSchema(schema: JSONSchemaProperty): Record<string, unknown> {
  return {
    type: schema.type as SchemaType,
    description: schema.description,
    enum: schema.enum,
    items: schema.items ? toGeminiSchema(schema.items) : undefined,
    properties: schema.properties
      ? Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)]))
      : undefined,
    required: schema.required,
  };
}

function toGeminiTools(tools: ToolDefinition[]): Tool[] {
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: toGeminiSchema(tool.parameters) as never,
      })),
    },
  ];
}

interface RawFunctionCallPart {
  functionCall: { name: string; args: object; id?: string };
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export class GeminiGateway implements ModelGateway {
  readonly metadata: ModelGatewayMetadata;
  private readonly client: GoogleGenerativeAI;

  /**
   * Gemini's live API attaches an opaque `thoughtSignature` (and its own
   * call `id`) to function-call parts on "thinking"-generation models, and
   * rejects the next turn with a 400 if that signature isn't echoed back
   * verbatim — confirmed against a real call, not documented in this SDK's
   * TypeScript types (@google/generative-ai 0.21.0 predates the field).
   * Since our neutral RequestedToolCall shape can't carry provider-specific
   * metadata, we stash the raw part here, keyed by the id we hand upstream,
   * and splice it back in when rebuilding history for the next turn.
   */
  private readonly rawFunctionCallParts = new Map<string, Part>();

  constructor(config: GeminiConfig) {
    this.metadata = { provider: "gemini", model: config.model };
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  private toGeminiContents(prompt: string, history: ToolTurnRequest["history"]): Content[] {
    const contents: Content[] = [{ role: "user", parts: [{ text: prompt }] }];

    for (const turn of history) {
      if (turn.role === "assistant") {
        const parts: Part[] = turn.toolCalls.map(
          (call) =>
            this.rawFunctionCallParts.get(call.id) ?? {
              functionCall: { name: call.name, args: JSON.parse(call.argsJson) as object },
            },
        );
        contents.push({ role: "model", parts });
      } else {
        // Despite older docs/examples showing role: "function" here, the
        // current API rejects it (400: "Role 'function' is not supported") —
        // confirmed against a live call. Function responses go in a "user" turn.
        contents.push({
          role: "user",
          parts: [{ functionResponse: { name: turn.name, response: JSON.parse(turn.resultJson) as object } }],
        });
      }
    }

    return contents;
  }

  async generateStructured<T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> {
    const start = Date.now();

    const model = this.client.getGenerativeModel({
      model: this.metadata.model,
      systemInstruction: request.system,
      generationConfig: {
        temperature: request.temperature ?? 0,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(
      request.prompt,
      request.timeoutMs === undefined ? undefined : { timeout: request.timeoutMs },
    );
    const text = result.response.text();
    if (!text) {
      throw new InvalidStructuredOutputError("Model returned an empty response", "");
    }

    const data = parseStructuredOutput(text, request.schema);
    return { data, metadata: this.metadata, latencyMs: Date.now() - start };
  }

  async runToolTurn(request: ToolTurnRequest): Promise<ToolTurnResult> {
    const model = this.client.getGenerativeModel({
      model: this.metadata.model,
      systemInstruction: request.system,
      tools: toGeminiTools(request.tools),
      toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY } },
      generationConfig: { temperature: request.temperature ?? 0 },
    });

    const result = await model.generateContent(
      { contents: this.toGeminiContents(request.prompt, request.history) },
      request.timeoutMs === undefined ? undefined : { timeout: request.timeoutMs },
    );

    const parts = result.response.candidates?.[0]?.content?.parts ?? [];
    const functionCallParts = parts.filter(
      (part): part is Part & RawFunctionCallPart => Boolean((part as { functionCall?: unknown }).functionCall),
    );

    if (functionCallParts.length > 0) {
      const calls = functionCallParts.map((part, index) => {
        const id = part.functionCall.id ?? `${part.functionCall.name}-${index}`;
        this.rawFunctionCallParts.set(id, part);
        return { id, name: part.functionCall.name, argsJson: JSON.stringify(part.functionCall.args) };
      });
      return { kind: "tool_calls", calls };
    }

    return { kind: "no_tool_call", text: result.response.text() };
  }
}

export function createGeminiGateway(config: GeminiConfig): ModelGateway {
  return new GeminiGateway(config);
}
