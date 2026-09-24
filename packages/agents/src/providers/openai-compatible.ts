import OpenAI from "openai";
import type { ModelGateway, ModelGatewayMetadata, StructuredOutputRequest, StructuredOutputResult } from "../model-gateway.js";
import { InvalidStructuredOutputError } from "../model-gateway.js";
import { parseStructuredOutput } from "./parse-structured-output.js";

export interface OpenAiCompatibleConfig {
  provider: "openai" | "deepseek" | "ollama";
  apiKey: string;
  model: string;
  baseURL?: string;
}

/**
 * OpenAI, DeepSeek, and Ollama (via its OpenAI-compatible /v1 endpoint) all
 * speak the same chat-completions API, so one implementation covers all
 * three — only the base URL and key differ. See docs/architecture/LLD.md §3.6.
 */
export class OpenAiCompatibleGateway implements ModelGateway {
  readonly metadata: ModelGatewayMetadata;
  private readonly client: OpenAI;

  constructor(config: OpenAiCompatibleConfig) {
    this.metadata = { provider: config.provider, model: config.model };
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
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
      },
      request.timeoutMs === undefined ? undefined : { timeout: request.timeoutMs },
    );

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new InvalidStructuredOutputError("Model returned an empty response", "");
    }

    const data = parseStructuredOutput(text, request.schema);
    return { data, metadata: this.metadata, latencyMs: Date.now() - start };
  }
}

export function createOpenAiCompatibleGateway(config: OpenAiCompatibleConfig): ModelGateway {
  return new OpenAiCompatibleGateway(config);
}
