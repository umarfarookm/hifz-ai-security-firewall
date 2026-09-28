import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ModelGateway, ProtectedAgentDeps, RunProtectedAgentResult } from "@hifz/agents";
import { runProtectedAgent, SEEDED_INBOX } from "@hifz/agents";
import type { AuditWriter } from "./audit.js";

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

export interface RunAgentDeps {
  audit: AuditWriter;
  /** Pass the raw createModelGateway("demo_agent", env) result — a "none"-provider gateway means the demo can't run at all. */
  gateway: ModelGateway;
  /** Synthetic secrets only (DEMO_FAKE_API_KEY / DEMO_FAKE_DB_PASSWORD in .env.example) — never real credentials (CLAUDE.md). */
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

    const result = await runProtectedAgent(deps.gateway, {
      instruction: body.instruction,
      sessionId,
      deps: buildAgentDeps(deps.knownSecrets),
      knownSecrets: knownSecretValues,
      ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
    });

    for (const call of result.toolCalls) {
      await deps.audit.writeToolCall({
        sessionId,
        tool: call.tool,
        argsRedacted: call.args,
        triggeringInspectionIds: [],
        outcome: call.guardOutcome,
        checks: [],
      });
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
