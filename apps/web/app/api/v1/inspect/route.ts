import { NextResponse } from "next/server";
import { runInspection } from "../../../../lib/inspect.js";
import { getAuditWriter, getEnv, getGateway, getVerdictCache, parseJsonBody, rateLimitOrNull } from "../../../../lib/api-helpers.js";

/**
 * POST /api/v1/inspect — docs/architecture/LLD.md §4.
 * The policy decision here is a temporary stub (apps/web/lib/policy-stub.ts)
 * pending task 2.3's real policy engine — everything else in this route is
 * the real pipeline (ingest → normalize → detect → score → escalate → audit).
 */
export async function POST(req: Request) {
  const env = getEnv();

  const limited = rateLimitOrNull(req, "inspect", env.RATE_LIMIT_PER_IP_PER_MIN);
  if (limited) return limited;

  const body = await parseJsonBody(req);
  const verdictCache = getVerdictCache();
  const outcome = await runInspection(body, {
    audit: getAuditWriter(),
    gateway: getGateway("investigator"),
    escalationBand: { min: env.LLM_ESCALATION_BAND_MIN, max: env.LLM_ESCALATION_BAND_MAX },
    failureMode: env.LLM_FAILURE_MODE,
    detectorVersion: "detectors-v1",
    sessionRiskDecayMinutes: env.SESSION_RISK_DECAY_MINUTES,
    investigatorTimeoutMs: env.LLM_TIMEOUT_MS,
    ...(verdictCache ? { verdictCache } : {}),
  });

  switch (outcome.kind) {
    case "success":
      return NextResponse.json({ correlationId: outcome.correlationId, ...outcome.body });
    case "validation_error":
      return NextResponse.json({ correlationId: outcome.correlationId, error: "invalid input", issues: outcome.issues }, { status: 400 });
    case "too_large":
      return NextResponse.json({ correlationId: outcome.correlationId, error: "content exceeds the 100KB size cap" }, { status: 413 });
    case "pipeline_error":
      return NextResponse.json({ correlationId: outcome.correlationId, error: "pipeline failure", message: outcome.message }, { status: 503 });
  }
}
