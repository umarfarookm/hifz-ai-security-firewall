import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuditWriter, getEnv } from "../../../../lib/api-helpers.js";
import { resolveGateway } from "../../../../lib/gateway.js";

/** GET /api/v1/health — docs/architecture/LLD.md §4. App, DB, and LLM provider status. */
export async function GET() {
  const correlationId = randomUUID();
  const env = getEnv();

  let db: "up" | "down" = "down";
  try {
    // ensureSession is the cheapest real round-trip every writer already implements.
    await getAuditWriter().ensureSession();
    db = "up";
  } catch {
    db = "down";
  }

  // Building the gateway is what actually fails when a key or model id is missing; the provider name alone
  // looks healthy either way. Only the status is exposed here — the reason goes to the server log.
  const investigator = resolveGateway("investigator", env).status;
  const demoAgent = resolveGateway("demo_agent", env).status;

  return NextResponse.json({
    correlationId,
    status: db === "up" && investigator !== "misconfigured" && demoAgent !== "misconfigured" ? "ok" : "degraded",
    app: "up",
    db,
    investigatorProvider: env.INVESTIGATOR_PROVIDER,
    investigatorLlm: investigator,
    demoAgentProvider: env.DEMO_AGENT_PROVIDER,
    demoAgentLlm: demoAgent,
    timestamp: new Date().toISOString(),
  });
}
