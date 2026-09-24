import Anthropic from "@anthropic-ai/sdk";
import type { ModelGateway, ModelGatewayMetadata, StructuredOutputRequest, StructuredOutputResult } from "../model-gateway.js";
import { InvalidStructuredOutputError } from "../model-gateway.js";
import { parseStructuredOutput } from "./parse-structured-output.js";

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
}

export function createAnthropicGateway(config: AnthropicConfig): ModelGateway {
  return new AnthropicGateway(config);
}
