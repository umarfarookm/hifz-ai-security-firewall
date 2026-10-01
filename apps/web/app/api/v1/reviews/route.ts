import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnv, getReviewStore, rateLimitOrNull } from "../../../../lib/api-helpers.js";
import { listReviews } from "../../../../lib/reviews.js";

/**
 * GET /api/v1/reviews — docs/architecture/LLD.md §4. The review queue. Public read, like GET /events (demo data
 * only); deciding an item is the authenticated part, see POST /reviews/{id}/decision.
 */
export async function GET(req: Request) {
  const limited = rateLimitOrNull(req, "reviews", getEnv().RATE_LIMIT_PER_IP_PER_MIN);
  if (limited) return limited;

  const url = new URL(req.url);
  try {
    const outcome = await listReviews(getReviewStore(), { state: url.searchParams.get("state"), limit: url.searchParams.get("limit") });
    if (outcome.kind === "invalid") {
      return NextResponse.json({ correlationId: outcome.correlationId, error: outcome.message }, { status: 400 });
    }
    return NextResponse.json({ correlationId: outcome.correlationId, items: outcome.items });
  } catch (err) {
    return NextResponse.json(
      { correlationId: randomUUID(), error: "pipeline failure", message: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
