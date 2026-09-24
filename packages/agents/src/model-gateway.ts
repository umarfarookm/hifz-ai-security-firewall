/**
 * Provider-neutral interface every LLM call in HIFZ goes through.
 * Nothing in firewall-core or the policy engine may depend on a specific
 * provider's SDK — only implementations of this interface may.
 *
 * Concrete providers (Gemini, Anthropic, OpenAI, DeepSeek, Ollama) are
 * implemented in packages/agents/src/providers/ and selected by env config
 * (see @hifz/config — INVESTIGATOR_PROVIDER / DEMO_AGENT_PROVIDER).
 */

export interface ModelGatewayMetadata {
  provider: "gemini" | "anthropic" | "openai" | "deepseek" | "ollama";
  model: string;
}

export interface StructuredOutputRequest<TSchema> {
  system: string;
  prompt: string;
  schema: TSchema;
  temperature?: number;
  timeoutMs?: number;
}

export interface StructuredOutputResult<TOutput> {
  data: TOutput;
  metadata: ModelGatewayMetadata;
  latencyMs: number;
}

export interface ModelGateway {
  readonly metadata: ModelGatewayMetadata;

  /**
   * Runs a prompt and parses the response against a schema. Implementations
   * must reject (never silently coerce) output that fails schema validation —
   * callers rely on that to trigger the fail-safe path in the escalation router.
   */
  generateStructured<TSchema, TOutput>(
    request: StructuredOutputRequest<TSchema>,
  ): Promise<StructuredOutputResult<TOutput>>;
}
