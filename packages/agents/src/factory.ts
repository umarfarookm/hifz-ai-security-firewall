import type { Env } from "@hifz/config";
import type { ModelGateway, ModelProvider } from "./model-gateway.js";
import { createAnthropicGateway } from "./providers/anthropic.js";
import { createGeminiGateway } from "./providers/gemini.js";
import { NoneGateway } from "./providers/none.js";
import { createOpenAiCompatibleGateway } from "./providers/openai-compatible.js";

export type ModelRole = "investigator" | "demo_agent";

export class ModelGatewayConfigError extends Error {}

/**
 * Builds the right ModelGateway for a role, based on validated env config.
 * Fails at construction time with a clear message rather than at the first
 * LLM call — consistent with "the app refuses to boot on invalid config"
 * (CLAUDE.md). We deliberately don't default *_MODEL to a hardcoded model
 * ID: provider model names change often enough that a stale default is
 * worse than an explicit, loud error telling you to set one.
 */
export function createModelGateway(role: ModelRole, env: Env): ModelGateway {
  const provider: ModelProvider = role === "investigator" ? env.INVESTIGATOR_PROVIDER : env.DEMO_AGENT_PROVIDER;
  const model = role === "investigator" ? env.INVESTIGATOR_MODEL : env.DEMO_AGENT_MODEL;
  const envVarName = role === "investigator" ? "INVESTIGATOR_MODEL" : "DEMO_AGENT_MODEL";

  if (provider === "none") {
    return new NoneGateway();
  }

  if (!model) {
    throw new ModelGatewayConfigError(
      `${envVarName} must be set when the provider is '${provider}'. Check the provider's docs for a current model ID and set it in .env.local.`,
    );
  }

  switch (provider) {
    case "gemini":
      return createGeminiGateway({ apiKey: requireKey(env.GOOGLE_GENERATIVE_AI_API_KEY, "GOOGLE_GENERATIVE_AI_API_KEY"), model });
    case "anthropic":
      return createAnthropicGateway({ apiKey: requireKey(env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"), model });
    case "openai":
      return createOpenAiCompatibleGateway({
        provider: "openai",
        apiKey: requireKey(env.OPENAI_API_KEY, "OPENAI_API_KEY"),
        model,
      });
    case "deepseek":
      return createOpenAiCompatibleGateway({
        provider: "deepseek",
        apiKey: requireKey(env.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY"),
        baseURL: "https://api.deepseek.com",
        model,
        // DeepSeek's current models think by default, and in thinking mode `tool_choice: "required"` (which the
        // investigator's tool loop sends) is rejected with a 400; temperature is also ignored there. Turn it off.
        extraBody: { thinking: { type: "disabled" } },
      });
    case "ollama":
      // Ollama's local server doesn't check the key — any non-empty string works.
      return createOpenAiCompatibleGateway({ provider: "ollama", apiKey: "ollama", baseURL: env.OLLAMA_BASE_URL, model });
    default:
      throw new ModelGatewayConfigError(`Unknown provider: ${provider satisfies never}`);
  }
}

function requireKey(value: string | undefined, envVarName: string): string {
  if (!value) {
    throw new ModelGatewayConfigError(`${envVarName} must be set in .env.local for the configured provider.`);
  }
  return value;
}
