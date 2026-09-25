import Anthropic from "@anthropic-ai/sdk";
import type {
  ModelGateway,
  ModelGatewayMetadata,
  StructuredOutputRequest,
  StructuredOutputResult,
  ToolTurnRequest,
} from "../model-gateway.js";
import { InvalidStructuredOutputError } from "../model-gateway.js";
import type { ToolDefinition, ToolTurnResult } from "../tool-types.js";
import { parseStructuredOutput } from "./parse-structured-output.js";

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as unknown as Anthropic.Tool.InputSchema,
  }));
}

function toAnthropicMessages(prompt: string, history: ToolTurnRequest["history"]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];

  // Anthropic requires strict user/assistant alternation, with all tool
  // results for one assistant turn batched into a single following user
  // message — unlike OpenAI's one-"tool"-message-per-call convention.
  let pendingResults: Anthropic.ToolResultBlockParam[] = [];

  const flushResults = () => {
    if (pendingResults.length > 0) {
      messages.push({ role: "user", content: pendingResults });
      pendingResults = [];
    }
  };

  for (const turn of history) {
    if (turn.role === "assistant") {
      flushResults();
      messages.push({
        role: "assistant",
        content: turn.toolCalls.map((call) => ({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: JSON.parse(call.argsJson) as unknown,
        })),
      });
    } else {
      pendingResults.push({ type: "tool_result", tool_use_id: turn.toolCallId, content: turn.resultJson });
    }
  }
  flushResults();

  return messages;
}

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

const MAX_OUTPUT_TOKENS = 1024;

export class AnthropicGateway implements ModelGateway {
  readonly metadata: ModelGatewayMetadata;
  private readonly client: Anthropic;

  constructor(config: AnthropicConfig) {
    this.metadata = { provider: "anthropic", model: config.model };
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async generateStructured<T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> {
    const start = Date.now();

    const message = await this.client.messages.create(
      {
        model: this.metadata.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: request.temperature ?? 0,
        system: `${request.system}\n\nRespond with a single JSON object only — no prose, no markdown fences.`,
        messages: [{ role: "user", content: request.prompt }],
      },
      request.timeoutMs === undefined ? undefined : { timeout: request.timeoutMs },
    );

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    if (!text) {
      throw new InvalidStructuredOutputError("Model returned an empty response", "");
    }

    const data = parseStructuredOutput(text, request.schema);
    return { data, metadata: this.metadata, latencyMs: Date.now() - start };
  }

  async runToolTurn(request: ToolTurnRequest): Promise<ToolTurnResult> {
    const message = await this.client.messages.create(
      {
        model: this.metadata.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: request.temperature ?? 0,
        system: request.system,
        tools: toAnthropicTools(request.tools),
        tool_choice: { type: "any" },
        messages: toAnthropicMessages(request.prompt, request.history),
      },
      request.timeoutMs === undefined ? undefined : { timeout: request.timeoutMs },
    );

    const toolUseBlocks = message.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");

    if (toolUseBlocks.length > 0) {
      return {
        kind: "tool_calls",
        calls: toolUseBlocks.map((block) => ({ id: block.id, name: block.name, argsJson: JSON.stringify(block.input) })),
      };
    }

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return { kind: "no_tool_call", text };
  }
}

export function createAnthropicGateway(config: AnthropicConfig): ModelGateway {
  return new AnthropicGateway(config);
}
