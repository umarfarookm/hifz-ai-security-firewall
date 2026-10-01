import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuditWriter, getEnv } from "../../../../lib/api-helpers.js";
import { buildHealth } from "../../../../lib/health.js";

// Health reports live state and is the keep-alive target: it must never be served from a cache.
export const dynamic = "force-dynamic";

/** GET /api/v1/health — docs/architecture/LLD.md §4. App, DB, and LLM provider status; also the daily keep-alive cron's target. */
export async function GET() {
  const { httpStatus, body } = await buildHealth({
    ping: () => getAuditWriter().ping(),
    env: getEnv(),
    correlationId: randomUUID(),
  });
  return NextResponse.json(body, { status: httpStatus });
}
