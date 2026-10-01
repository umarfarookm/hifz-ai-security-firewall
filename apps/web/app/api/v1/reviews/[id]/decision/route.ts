import { NextResponse } from "next/server";
import { getEnv, getReviewStore, parseJsonBody, rateLimitOrNull } from "../../../../../../lib/api-helpers.js";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server.js";
import { bearerToken, decideReview, verifyReviewer } from "../../../../../../lib/reviews.js";

/**
 * POST /api/v1/reviews/{id}/decision — docs/architecture/LLD.md §4. Approve or reject a pending review item.
 * Requires `Authorization: Bearer <Supabase access token>` for a user whose app_metadata.role is "reviewer".
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const env = getEnv();
  const limited = rateLimitOrNull(req, "review-decision", env.RATE_LIMIT_PER_IP_PER_MIN);
  if (limited) return limited;

  const { id } = await params;
  const body = await parseJsonBody(req);
  const client = createServerSupabaseClient(env);

  try {
    const outcome = await decideReview(id, body, bearerToken(req.headers.get("authorization")), {
      store: getReviewStore(),
      verify: (token) => verifyReviewer(client, token),
    });

    switch (outcome.kind) {
      case "success":
        return NextResponse.json({ correlationId: outcome.correlationId, item: outcome.item, effect: outcome.effect });
      case "unauthenticated":
        return NextResponse.json({ correlationId: outcome.correlationId, error: "sign in as a reviewer to decide" }, { status: 401 });
      case "forbidden":
        return NextResponse.json({ correlationId: outcome.correlationId, error: "this account is not a reviewer" }, { status: 403 });
      case "invalid":
        return NextResponse.json({ correlationId: outcome.correlationId, error: "invalid input", issues: outcome.issues }, { status: 400 });
      case "not_found":
        return NextResponse.json({ correlationId: outcome.correlationId, error: `no review with id "${id}"` }, { status: 404 });
      case "conflict":
        return NextResponse.json(
          {
            correlationId: outcome.correlationId,
            error: outcome.reason === "expired" ? "this review expired before a decision (treated as rejected)" : "this review was already decided",
          },
          { status: 409 },
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: "pipeline failure", message: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
