import { NextResponse } from "next/server";
import { runAgentRun } from "../../../../../lib/agent-run.js";
import { getAuditWriter, getEnv, getGateway, parseJsonBody, rateLimitOrNull } from "../../../../../lib/api-helpers.js";

/** Fixed per docs/architecture/LLD.md §9 ("3 req/min") — not derived from RATE_LIMIT_PER_IP_PER_MIN, which is /inspect's own limit. */
const AGENT_RUN_RATE_LIMIT_PER_MIN = 3;

/**
 * POST /api/v1/agent/run — docs/architecture/LLD.md §4. Runs the protected
 * email demo agent (stage ⑦) behind the Action Guard (stage ⑧). Stricter
 * rate limit than /inspect since this can trigger real tool calls.
 */
export async function POST(req: Request) {
  const env = getEnv();

  const limited = rateLimitOrNull(req, "agent-run", AGENT_RUN_RATE_LIMIT_PER_MIN);
  if (limited) return limited;

  const body = await parseJsonBody(req);
  const outcome = await runAgentRun(body, {
    audit: getAuditWriter(),
    gateway: getGateway("demo_agent"),
    knownSecrets: {
      ...(env.DEMO_FAKE_API_KEY === undefined ? {} : { apiKey: env.DEMO_FAKE_API_KEY }),
      ...(env.DEMO_FAKE_DB_PASSWORD === undefined ? {} : { dbPassword: env.DEMO_FAKE_DB_PASSWORD }),
    },
    timeoutMs: env.LLM_TIMEOUT_MS,
  });

  switch (outcome.kind) {
    case "success":
      return NextResponse.json({ correlationId: outcome.correlationId, ...outcome.body });
    case "validation_error":
      return NextResponse.json({ correlationId: outcome.correlationId, error: "invalid input", issues: outcome.issues }, { status: 400 });
    case "llm_unavailable":
      return NextResponse.json(
        { correlationId: outcome.correlationId, error: "the demo agent's LLM is unavailable (DEMO_AGENT_PROVIDER is 'none' or its key/model is misconfigured) — see GET /api/v1/health" },
        { status: 503 },
      );
    case "pipeline_error":
      return NextResponse.json({ correlationId: outcome.correlationId, error: "pipeline failure", message: outcome.message }, { status: 503 });
  }
}
