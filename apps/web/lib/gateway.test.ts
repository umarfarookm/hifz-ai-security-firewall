import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@hifz/config";
import { resetGatewayLogState, resolveGateway } from "./gateway.js";

function env(overrides: Partial<Env>): Env {
  return {
    INVESTIGATOR_PROVIDER: "none",
    DEMO_AGENT_PROVIDER: "none",
    OLLAMA_BASE_URL: "http://localhost:11434/v1",
    ...overrides,
  } as Env;
}

describe("resolveGateway", () => {
  beforeEach(() => resetGatewayLogState());
  afterEach(() => vi.restoreAllMocks());

  it("degrades a missing API key to the rules-only gateway instead of throwing (regression: production /inspect 500)", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const resolved = resolveGateway("investigator", env({ INVESTIGATOR_PROVIDER: "deepseek", INVESTIGATOR_MODEL: "deepseek-flash" }));

    expect(resolved.status).toBe("misconfigured");
    expect(resolved.gateway.metadata.provider).toBe("none"); // callers treat "none" as rules-only, fail-safe REVIEW in the band
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]![0])).toContain("DEEPSEEK_API_KEY");
  });

  it("degrades a missing model id the same way", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const resolved = resolveGateway("demo_agent", env({ DEMO_AGENT_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "k" }));
    expect(resolved.status).toBe("misconfigured");
    expect(resolved.gateway.metadata.provider).toBe("none");
  });

  it("logs a given misconfiguration once, not on every request", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = env({ INVESTIGATOR_PROVIDER: "deepseek", INVESTIGATOR_MODEL: "m" });
    resolveGateway("investigator", bad);
    resolveGateway("investigator", bad);
    resolveGateway("investigator", bad);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("returns the real gateway when configuration is valid", () => {
    const resolved = resolveGateway("investigator", env({ INVESTIGATOR_PROVIDER: "deepseek", INVESTIGATOR_MODEL: "deepseek-flash", DEEPSEEK_API_KEY: "k" }));
    expect(resolved.status).toBe("ok");
    expect(resolved.gateway.metadata).toEqual({ provider: "deepseek", model: "deepseek-flash" });
  });

  it("reports an intentional 'none' provider as rules_only, not as misconfigured", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const resolved = resolveGateway("investigator", env({ INVESTIGATOR_PROVIDER: "none" }));
    expect(resolved.status).toBe("rules_only");
    expect(log).not.toHaveBeenCalled();
  });
});
