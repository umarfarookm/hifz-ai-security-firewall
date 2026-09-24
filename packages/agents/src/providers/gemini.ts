import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ModelGateway, ModelGatewayMetadata, StructuredOutputRequest, StructuredOutputResult } from "../model-gateway.js";
import { InvalidStructuredOutputError } from "../model-gateway.js";
import { parseStructuredOutput } from "./parse-structured-output.js";

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export class GeminiGateway implements ModelGateway {
  readonly metadata: ModelGatewayMetadata;
  private readonly client: GoogleGenerativeAI;

  constructor(config: GeminiConfig) {
    this.metadata = { provider: "gemini", model: config.model };
    this.client = new GoogleGenerativeAI(config.apiKey);
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
}

export function createGeminiGateway(config: GeminiConfig): ModelGateway {
  return new GeminiGateway(config);
}
