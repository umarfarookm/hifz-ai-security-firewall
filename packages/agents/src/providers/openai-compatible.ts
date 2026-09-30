import OpenAI from "openai";
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

function toOpenAiSchema(schema: JSONSchemaProperty): Record<string, unknown> {
  // OpenAI accepts plain JSON Schema — our shape is already a subset of it.
  return schema as unknown as Record<string, unknown>;
}

function toOpenAiTools(tools: ToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toOpenAiSchema(tool.parameters),
    },
  }));
}

export interface OpenAiCompatibleConfig {
  provider: "openai" | "deepseek" | "ollama";
  apiKey: string;
  model: string;
  baseURL?: string;
  /**
   * Extra top-level fields merged into every chat-completions request body, for provider-specific
   * parameters the OpenAI SDK's types don't know about (e.g. DeepSeek's `thinking`).
   */
  extraBody?: Record<string, unknown>;
  /** Injected for tests; defaults to a real OpenAI client built from apiKey/baseURL. */
  client?: OpenAI;
}

/**
 * OpenAI, DeepSeek, and Ollama (via its OpenAI-compatible /v1 endpoint) all
 * speak the same chat-completions API, so one implementation covers all
 * three — only the base URL and key differ. See docs/architecture/LLD.md §3.6.
 */
export class OpenAiCompatibleGateway implements ModelGateway {
  readonly metadata: ModelGatewayMetadata;
  private readonly client: OpenAI;
  private readonly extraBody: Record<string, unknown>;

  constructor(config: OpenAiCompatibleConfig) {
    this.metadata = { provider: config.provider, model: config.model };
    this.client = config.client ?? new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
    this.extraBody = config.extraBody ?? {};
  }

  async generateStructured<T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> {
    const start = Date.now();

    const response = await this.client.chat.completions.create(
      {
        model: this.metadata.model,
        temperature: request.temperature ?? 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${request.system}\n\nRespond with a single JSON object only — no prose, no markdown fences.` },
          { role: "user", content: request.prompt },
        ],
        ...this.extraBody,
      } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
      request.timeoutMs === undefined ? undefined : { timeout: request.timeoutMs },
    );

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new InvalidStructuredOutputError("Model returned an empty response", "");
    }

    const data = parseStructuredOutput(text, request.schema);
    return { data, metadata: this.metadata, latencyMs: Date.now() - start };
  }

  async runToolTurn(request: ToolTurnRequest): Promise<ToolTurnResult> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: request.system },
      { role: "user", content: request.prompt },
    ];

    for (const turn of request.history) {
      if (turn.role === "assistant") {
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: turn.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: call.argsJson },
          })),
        });
      } else {
        messages.push({ role: "tool", tool_call_id: turn.toolCallId, content: turn.resultJson });
      }
    }

    const response = await this.client.chat.completions.create(
      {
        model: this.metadata.model,
        temperature: request.temperature ?? 0,
        tools: toOpenAiTools(request.tools),
        tool_choice: "required",
        messages,
        ...this.extraBody,
      } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
      request.timeoutMs === undefined ? undefined : { timeout: request.timeoutMs },
    );

    const message = response.choices[0]?.message;
    const toolCalls = message?.tool_calls?.filter((c): c is OpenAI.Chat.ChatCompletionMessageToolCall & { type: "function" } => c.type === "function");

    if (toolCalls && toolCalls.length > 0) {
      return {
        kind: "tool_calls",
        calls: toolCalls.map((call) => ({ id: call.id, name: call.function.name, argsJson: call.function.arguments })),
      };
    }

    return { kind: "no_tool_call", text: message?.content ?? "" };
  }
}

export function createOpenAiCompatibleGateway(config: OpenAiCompatibleConfig): ModelGateway {
  return new OpenAiCompatibleGateway(config);
}
