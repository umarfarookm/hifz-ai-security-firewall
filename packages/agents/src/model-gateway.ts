import type { z } from "zod";

/**
 * Provider-neutral interface every LLM call in HIFZ goes through.
 * Nothing in firewall-core or the policy engine may depend on a specific
 * provider's SDK — only implementations of this interface may.
 *
 * Concrete providers (Gemini, Anthropic, OpenAI, DeepSeek, Ollama) are
 * implemented in packages/agents/src/providers/ and selected by
 * createModelGateway() (see factory.ts) based on env config
 * (@hifz/config — INVESTIGATOR_PROVIDER / DEMO_AGENT_PROVIDER).
 */

export type ModelProvider = "gemini" | "anthropic" | "openai" | "deepseek" | "ollama" | "none";

export interface ModelGatewayMetadata {
  provider: ModelProvider;
  model: string;
}

export interface StructuredOutputRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  timeoutMs?: number;
}

export interface StructuredOutputResult<T> {
  data: T;
  metadata: ModelGatewayMetadata;
  latencyMs: number;
}

export class InvalidStructuredOutputError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = "InvalidStructuredOutputError";
  }
}

export interface ModelGateway {
  readonly metadata: ModelGatewayMetadata;

  /**
   * Runs a prompt and parses the response against a schema. Implementations
   * must throw InvalidStructuredOutputError (never silently coerce) when the
   * response fails schema validation — callers rely on that to trigger the
   * fail-safe path in the escalation router (docs/architecture/LLD.md §3.6).
   */
  generateStructured<T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>>;
}
