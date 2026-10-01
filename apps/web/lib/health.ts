import type { Env } from "@hifz/config";
import { resolveGateway, type LlmConfigStatus } from "./gateway.js";

export interface HealthBody {
  correlationId: string;
  status: "ok" | "degraded";
  app: "up";
  db: "up" | "down";
  investigatorProvider: Env["INVESTIGATOR_PROVIDER"];
  investigatorLlm: LlmConfigStatus;
  demoAgentProvider: Env["DEMO_AGENT_PROVIDER"];
  demoAgentLlm: LlmConfigStatus;
  timestamp: string;
}

export interface HealthDeps {
  /** A read-only database round trip; throws when the database is unreachable. */
  ping: () => Promise<void>;
  env: Env;
  correlationId: string;
  now?: () => Date;
}

/**
 * GET /api/v1/health and the daily keep-alive cron (docs/architecture/LLD.md §4, HLD §11).
 *
 * `db` comes from a read-only query, so calling this never writes anything: the endpoint is public and
 * unthrottled, and the cron hits it daily. The HTTP status is 503 only when the database is down, so a failed
 * keep-alive shows up as a failed cron run; a misconfigured LLM role is reported as `degraded` but stays 200,
 * because the service still works (it degrades to rules-only, LLD §3.5).
 */
export async function buildHealth(deps: HealthDeps): Promise<{ httpStatus: 200 | 503; body: HealthBody }> {
  let db: "up" | "down" = "down";
  try {
    await deps.ping();
    db = "up";
  } catch {
    db = "down";
  }

  // Building the gateway is what actually fails when a key or model id is missing; the provider name alone
  // looks healthy either way. Only the status is exposed here: the reason goes to the server log.
  const investigatorLlm = resolveGateway("investigator", deps.env).status;
  const demoAgentLlm = resolveGateway("demo_agent", deps.env).status;

  return {
    httpStatus: db === "up" ? 200 : 503,
    body: {
      correlationId: deps.correlationId,
      status: db === "up" && investigatorLlm !== "misconfigured" && demoAgentLlm !== "misconfigured" ? "ok" : "degraded",
      app: "up",
      db,
      investigatorProvider: deps.env.INVESTIGATOR_PROVIDER,
      investigatorLlm,
      demoAgentProvider: deps.env.DEMO_AGENT_PROVIDER,
      demoAgentLlm,
      timestamp: (deps.now ?? (() => new Date()))().toISOString(),
    },
  };
}
