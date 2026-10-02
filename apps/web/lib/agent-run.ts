import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ModelGateway, ProtectedAgentDeps, RunProtectedAgentResult } from "@hifz/agents";
import { runProtectedAgent, SEEDED_INBOX, TOOL_REGISTRY } from "@hifz/agents";
import type { AuditWriter } from "./audit.js";
import type { ReviewStore } from "./review-store.js";

const agentRunRequestSchema = z.object({
  instruction: z.string().min(1),
  sessionId: z.string().optional(),
});

export type AgentRunRequestBody = z.infer<typeof agentRunRequestSchema>;

export interface AgentRunResponseBody {
  finalMessage: string | null;
  toolCalls: RunProtectedAgentResult["toolCalls"];
  llmStatus: RunProtectedAgentResult["llmStatus"];
  sessionId: string;
}

export type AgentRunOutcome =
  | { kind: "success"; correlationId: string; body: AgentRunResponseBody }
  | { kind: "validation_error"; correlationId: string; issues: string[] }
  | { kind: "llm_unavailable"; correlationId: string }
  | { kind: "pipeline_error"; correlationId: string; message: string };

const HIGH_RISK_TOOL_NAMES = Object.values(TOOL_REGISTRY)
  .filter((tool) => tool.riskClass !== "low")
  .map((tool) => tool.name);

/** G6's window (LLD.md §3.9: "at most 3 high-risk calls allowed in 5 min"). */
const G6_WINDOW_MINUTES = 5;

export interface RunAgentDeps {
  audit: AuditWriter;
  /** LLD §3.11 — a REQUIRE_APPROVAL guard outcome creates a PENDING item here. */
  reviews: ReviewStore;
  /** Pass the raw createModelGateway("demo_agent", env) result — a "none"-provider gateway means the demo can't run at all. */
  gateway: ModelGateway;
  /** Synthetic secrets only (DEMO_FAKE_API_KEY / DEMO_FAKE_DB_PASSWORD in .env.example) — never real credentials (docs/architecture/HLD.md §10). */
  knownSecrets: { apiKey?: string; dbPassword?: string };
  timeoutMs?: number;
}

function buildAgentDeps(knownSecrets: RunAgentDeps["knownSecrets"]): ProtectedAgentDeps {
  const byName: Record<string, string | undefined> = { api_key: knownSecrets.apiKey, db_password: knownSecrets.dbPassword };
  return {
    getInbox: () => SEEDED_INBOX,
    getSecret: (name: string) => byName[name] ?? null,
  };
}

export async function runAgentRun(rawBody: unknown, deps: RunAgentDeps): Promise<AgentRunOutcome> {
  const correlationId = randomUUID();

  const parsed = agentRunRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      correlationId,
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const body = parsed.data;

  if (deps.gateway.metadata.provider === "none") {
    return { kind: "llm_unavailable", correlationId };
  }

  try {
    const sessionId = await deps.audit.ensureSession(body.sessionId);
    const knownSecretValues = [deps.knownSecrets.apiKey, deps.knownSecrets.dbPassword].filter((s): s is string => Boolean(s));
    const initialHighRiskCallCount = await deps.audit.countRecentToolCalls(sessionId, HIGH_RISK_TOOL_NAMES, G6_WINDOW_MINUTES);

    const result = await runProtectedAgent(deps.gateway, {
      instruction: body.instruction,
      sessionId,
      deps: buildAgentDeps(deps.knownSecrets),
      knownSecrets: knownSecretValues,
      initialHighRiskCallCount,
      ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
    });

    for (const call of result.toolCalls) {
      const toolCallId = await deps.audit.writeToolCall({
        sessionId,
        tool: call.tool,
        argsRedacted: call.args,
        // No inspection rows exist for these calls: read_inbox scores each seeded email in memory. The
        // triggering emails are recorded as content ids ("inbox-004"), which the audit writer stores in
        // args_redacted — they are not inspections.id UUIDs, so they must never go into the uuid[] column.
        triggeringInspectionIds: [],
        triggeringContentIds: call.triggeringContentIds,
        outcome: call.guardOutcome,
        checks: call.checks,
      });
      if (call.guardOutcome === "REQUIRE_APPROVAL") await deps.reviews.createForToolCall(toolCallId);
    }

    return {
      kind: "success",
      correlationId,
      body: { finalMessage: result.finalMessage, toolCalls: result.toolCalls, llmStatus: result.llmStatus, sessionId },
    };
  } catch (err) {
    return { kind: "pipeline_error", correlationId, message: err instanceof Error ? err.message : String(err) };
  }
}
