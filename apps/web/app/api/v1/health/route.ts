import { NextResponse } from "next/server";
import { getAuditWriter, getEnv } from "../../../../lib/api-helpers.js";

/** GET /api/v1/health — docs/architecture/LLD.md §4. App, DB, and LLM provider status. */
export async function GET() {
  const env = getEnv();

  let db: "up" | "down" = "down";
  try {
    // ensureSession is the cheapest real round-trip every writer already implements.
    await getAuditWriter().ensureSession();
    db = "up";
  } catch {
    db = "down";
  }

  return NextResponse.json({
    status: db === "up" ? "ok" : "degraded",
    app: "up",
    db,
    investigatorProvider: env.INVESTIGATOR_PROVIDER,
    demoAgentProvider: env.DEMO_AGENT_PROVIDER,
    timestamp: new Date().toISOString(),
  });
}
