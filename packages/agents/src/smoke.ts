#!/usr/bin/env node
/**
 * Manual smoke test for task 1.5's acceptance criterion: "one structured
 * output call succeeds per configured provider." Not part of `pnpm test` —
 * it makes a real network call and costs real quota, so it's opt-in.
 *
 * Usage: pnpm --filter @hifz/agents run smoke [investigator|demo_agent]
 * Reads config from .env.local via @hifz/config, same as the app does.
 */
import { config } from "dotenv";
import { z } from "zod";
import { loadEnv } from "@hifz/config";
import { createModelGateway, type ModelRole } from "./factory.js";

// pnpm runs this with cwd = packages/agents; .env.local lives at the repo root.
config({ path: "../../.env.local" });

const role: ModelRole = process.argv[2] === "demo_agent" ? "demo_agent" : "investigator";

const smokeTestSchema = z.object({
  acknowledged: z.literal(true),
  provider: z.string(),
});

async function main(): Promise<void> {
  const env = loadEnv();
  const gateway = createModelGateway(role, env);

  console.log(`[smoke] role=${role} provider=${gateway.metadata.provider} model=${gateway.metadata.model}`);

  if (gateway.metadata.provider === "none") {
    console.log("[smoke] provider is 'none' — nothing to call. Set a real provider + model + key to test one.");
    return;
  }

  const start = Date.now();
  const result = await gateway.generateStructured({
    system: "You are a smoke test. Respond only with the requested JSON object.",
    prompt: `Respond with exactly this JSON object: {"acknowledged": true, "provider": "${gateway.metadata.provider}"}`,
    schema: smokeTestSchema,
    timeoutMs: 20000,
  });

  console.log(`[smoke] OK in ${Date.now() - start}ms:`, result.data);
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exitCode = 1;
});
