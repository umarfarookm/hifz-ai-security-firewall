import { createModelGateway, ModelGatewayConfigError, NoneGateway, type ModelGateway, type ModelRole } from "@hifz/agents";
import type { Env } from "@hifz/config";

export type LlmConfigStatus = "ok" | "rules_only" | "misconfigured";

export interface GatewayResolution {
  gateway: ModelGateway;
  status: LlmConfigStatus;
}

const alreadyLogged = new Set<string>();

/**
 * Builds the gateway for a role, but never lets a *configuration* error (missing API key, missing model id)
 * take a request down. docs/architecture/LLD.md §3.5: an LLM problem degrades to the fail-safe path — the "none"
 * provider, so mid-band cases become REVIEW with "the LLM did not weigh in" — it is never a 5xx. The
 * misconfiguration is logged once per role and reported by GET /health.
 */
export function resolveGateway(role: ModelRole, env: Env): GatewayResolution {
  try {
    const gateway = createModelGateway(role, env);
    return { gateway, status: gateway.metadata.provider === "none" ? "rules_only" : "ok" };
  } catch (err) {
    if (!(err instanceof ModelGatewayConfigError)) throw err;
    const key = `${role}:${err.message}`;
    if (!alreadyLogged.has(key)) {
      alreadyLogged.add(key);
      console.error(`[hifz] ${role} LLM is misconfigured, degrading to rules-only fail-safe: ${err.message}`);
    }
    return { gateway: new NoneGateway(), status: "misconfigured" };
  }
}

/** Test hook: forget which misconfigurations were already logged. */
export function resetGatewayLogState(): void {
  alreadyLogged.clear();
}
