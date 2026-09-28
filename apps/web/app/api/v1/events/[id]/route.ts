import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuditWriter, getEnv, rateLimitOrNull } from "../../../../../lib/api-helpers.js";

/** GET /api/v1/events/{id} — docs/architecture/LLD.md §4. Full evidence for one inspection. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = randomUUID();
  const env = getEnv();
  const limited = rateLimitOrNull(req, "events", env.RATE_LIMIT_PER_IP_PER_MIN);
  if (limited) return limited;

  const { id } = await params;

  try {
    const detail = await getAuditWriter().getEventDetail(id);
    if (!detail) {
      return NextResponse.json({ correlationId, error: `no event with id "${id}"` }, { status: 404 });
    }
    return NextResponse.json({ correlationId, ...detail });
  } catch (err) {
    return NextResponse.json(
      { correlationId, error: "pipeline failure", message: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
