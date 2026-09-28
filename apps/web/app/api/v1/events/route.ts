import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuditWriter, getEnv, rateLimitOrNull } from "../../../../lib/api-helpers.js";

const VALID_BANDS = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const VALID_ACTIONS = new Set(["ALLOW", "SANITIZE", "REVIEW", "BLOCK"]);
const MAX_LIMIT = 100;

/** GET /api/v1/events — docs/architecture/LLD.md §4. Paginated audit events. */
export async function GET(req: Request) {
  const correlationId = randomUUID();
  const env = getEnv();
  const limited = rateLimitOrNull(req, "events", env.RATE_LIMIT_PER_IP_PER_MIN);
  if (limited) return limited;

  const url = new URL(req.url);
  const band = url.searchParams.get("band") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;
  const attackType = url.searchParams.get("attackType") ?? undefined;
  const since = url.searchParams.get("since") ?? undefined;
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limitParam = url.searchParams.get("limit");

  if (band && !VALID_BANDS.has(band)) {
    return NextResponse.json({ correlationId, error: `invalid band "${band}"` }, { status: 400 });
  }
  if (action && !VALID_ACTIONS.has(action)) {
    return NextResponse.json({ correlationId, error: `invalid action "${action}"` }, { status: 400 });
  }
  const limit = limitParam ? Number(limitParam) : 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return NextResponse.json({ correlationId, error: `limit must be an integer between 1 and ${MAX_LIMIT}` }, { status: 400 });
  }

  try {
    const page = await getAuditWriter().listEvents({
      ...(band ? { band: band as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } : {}),
      ...(action ? { action: action as "ALLOW" | "SANITIZE" | "REVIEW" | "BLOCK" } : {}),
      ...(attackType ? { attackType } : {}),
      ...(since ? { since } : {}),
      ...(cursor ? { cursor } : {}),
      limit,
    });
    return NextResponse.json({ correlationId, ...page });
  } catch (err) {
    return NextResponse.json(
      { correlationId, error: "pipeline failure", message: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
