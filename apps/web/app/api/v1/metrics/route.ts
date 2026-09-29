import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnv, rateLimitOrNull } from "../../../../lib/api-helpers.js";
import { createServerSupabaseClient } from "../../../../lib/supabase-server.js";
import { getMetrics } from "../../../../lib/metrics.js";

/** GET /api/v1/metrics — docs/architecture/LLD.md §4. Live counters + latest eval summaries, all from the DB. */
export async function GET(req: Request) {
  const correlationId = randomUUID();
  const env = getEnv();
  const limited = rateLimitOrNull(req, "metrics", env.RATE_LIMIT_PER_IP_PER_MIN);
  if (limited) return limited;

  try {
    const metrics = await getMetrics(createServerSupabaseClient(env));
    return NextResponse.json({ correlationId, ...metrics });
  } catch (err) {
    return NextResponse.json(
      { correlationId, error: "pipeline failure", message: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
