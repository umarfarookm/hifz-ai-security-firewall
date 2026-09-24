import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const baseValidEnv = {
  INVESTIGATOR_PROVIDER: "none",
  DEMO_AGENT_PROVIDER: "none",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

describe("loadEnv", () => {
  it("accepts a minimal valid configuration and fills in defaults", () => {
    const env = loadEnv(baseValidEnv);
    expect(env.RISK_THRESHOLD_MEDIUM).toBe(30);
    expect(env.LLM_FAILURE_MODE).toBe("review");
  });

  it("rejects out-of-order risk thresholds", () => {
    expect(() =>
      loadEnv({ ...baseValidEnv, RISK_THRESHOLD_MEDIUM: "70", RISK_THRESHOLD_HIGH: "60" }),
    ).toThrow(/RISK_THRESHOLD_MEDIUM must be lower/);
  });

  it("rejects ollama as a provider in the demo environment", () => {
    expect(() =>
      loadEnv({ ...baseValidEnv, APP_ENV: "demo", INVESTIGATOR_PROVIDER: "ollama" }),
    ).toThrow(/Ollama cannot be selected/);
  });

  it("rejects a missing Supabase URL", () => {
    const { NEXT_PUBLIC_SUPABASE_URL: _omitted, ...withoutUrl } = baseValidEnv;
    expect(() => loadEnv(withoutUrl)).toThrow();
  });
});
