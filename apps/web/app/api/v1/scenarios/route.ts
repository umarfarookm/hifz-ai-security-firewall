import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnv, rateLimitOrNull } from "../../../../lib/api-helpers.js";
import { SCENARIOS } from "../../../../lib/scenarios.js";

/** GET /api/v1/scenarios — docs/architecture/LLD.md §4. The pre-built demo scenarios, one per committed attack type. */
export async function GET(req: Request) {
  const limited = rateLimitOrNull(req, "scenarios", getEnv().RATE_LIMIT_PER_IP_PER_MIN);
  if (limited) return limited;
  return NextResponse.json({ correlationId: randomUUID(), scenarios: SCENARIOS });
}
