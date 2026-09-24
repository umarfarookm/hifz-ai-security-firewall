import type { Env } from "@hifz/config";
import { envSchema } from "@hifz/config";
import { describe, expect, it } from "vitest";
import { createModelGateway, ModelGatewayConfigError } from "./factory.js";
import { NoneGateway } from "./providers/none.js";

function env(overrides: Partial<Env>): Env {
  return envSchema.parse({
    INVESTIGATOR_PROVIDER: "none",
    DEMO_AGENT_PROVIDER: "none",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    ...overrides,
  });
}

describe("createModelGateway", () => {
  it("returns a NoneGateway for provider 'none'", () => {
    const gateway = createModelGateway("investigator", env({}));
    expect(gateway).toBeInstanceOf(NoneGateway);
    expect(gateway.metadata).toEqual({ provider: "none", model: "none" });
  });

  it("throws a clear config error when a real provider has no model configured", () => {
    expect(() =>
      createModelGateway("investigator", env({ INVESTIGATOR_PROVIDER: "gemini", GOOGLE_GENERATIVE_AI_API_KEY: "k" })),
    ).toThrow(/INVESTIGATOR_MODEL must be set/);
  });

  it("throws a clear config error when the provider's API key is missing", () => {
    expect(() =>
      createModelGateway("investigator", env({ INVESTIGATOR_PROVIDER: "gemini", INVESTIGATOR_MODEL: "some-model" })),
    ).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY must be set/);
  });

  it("builds a gemini gateway with the configured model once key and model are present", () => {
    const gateway = createModelGateway(
      "investigator",
      env({ INVESTIGATOR_PROVIDER: "gemini", INVESTIGATOR_MODEL: "gemini-test-model", GOOGLE_GENERATIVE_AI_API_KEY: "k" }),
    );
    expect(gateway.metadata).toEqual({ provider: "gemini", model: "gemini-test-model" });
  });

  it("builds an ollama gateway without requiring an API key", () => {
    const gateway = createModelGateway(
      "demo_agent",
      env({ DEMO_AGENT_PROVIDER: "ollama", DEMO_AGENT_MODEL: "llama3.1" }),
    );
    expect(gateway.metadata).toEqual({ provider: "ollama", model: "llama3.1" });
  });

  it("distinguishes investigator vs demo_agent config independently", () => {
    const gateway = createModelGateway(
      "demo_agent",
      env({
        INVESTIGATOR_PROVIDER: "none",
        DEMO_AGENT_PROVIDER: "anthropic",
        DEMO_AGENT_MODEL: "claude-test",
        ANTHROPIC_API_KEY: "k",
      }),
    );
    expect(gateway.metadata).toEqual({ provider: "anthropic", model: "claude-test" });
  });

  it("wraps missing-config failures in ModelGatewayConfigError", () => {
    expect(() => createModelGateway("investigator", env({ INVESTIGATOR_PROVIDER: "openai" }))).toThrow(
      ModelGatewayConfigError,
    );
  });
});
