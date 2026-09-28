import type { InvestigatorVerdict, LlmStatus, Signal } from "@hifz/firewall-core";
import type { ModelGateway } from "../model-gateway.js";
import type { RequestedToolCall, ToolConversationMessage } from "../tool-types.js";
import type { VerdictCache } from "./cache.js";
import { computeCacheKey } from "./cache.js";
import { buildSystemPrompt, buildUserPrompt, generateDelimiter } from "./prompt.js";
import type { InvestigatorTools } from "./tools.js";
import { INVESTIGATOR_TOOL_DEFINITIONS } from "./tools.js";
import type { LlmVerdict } from "./verdict-schema.js";
import { llmVerdictSchema, SUBMIT_VERDICT_TOOL } from "./verdict-schema.js";

const MAX_INVESTIGATIVE_TOOL_CALLS = 4;
const MAX_RETRIES_ON_INVALID = 1;
/** Hard ceiling on loop iterations, independent of the retry/tool-call counters above — a safety net against a model that won't converge. */
const MAX_LOOP_ITERATIONS = 12;

export interface InvestigateRequest {
  /** The normalized content the investigator analyses — visible text plus whatever layer info the caller wants included. */
  content: string;
  signals: Signal[];
  tools: InvestigatorTools;
  /** Included in the cache key so a detector-rule change invalidates old cached verdicts. */
  detectorVersion: string;
  cache?: VerdictCache;
  timeoutMs?: number;
}

export interface InvestigateResult {
  verdict: InvestigatorVerdict | null;
  llmStatus: LlmStatus;
  stepsTaken: string[];
}

export async function investigate(gateway: ModelGateway, request: InvestigateRequest): Promise<InvestigateResult> {
  const modelTag = `${gateway.metadata.provider}:${gateway.metadata.model}`;
  const cacheKey = computeCacheKey(request.content, request.detectorVersion, modelTag);

  if (request.cache) {
    const cached = await request.cache.get(cacheKey);
    if (cached) {
      return { verdict: toInvestigatorVerdict(cached.verdict, cached.modelTag), llmStatus: "cached", stepsTaken: [] };
    }
  }

  const delimiter = generateDelimiter();
  const system = buildSystemPrompt();
  const prompt = buildUserPrompt({ delimiter, content: request.content, signals: request.signals });
  const tools = [...INVESTIGATOR_TOOL_DEFINITIONS, SUBMIT_VERDICT_TOOL];

  const history: ToolConversationMessage[] = [];
  const stepsTaken: string[] = [];
  let investigativeToolCalls = 0;
  let invalidAttempts = 0;

  try {
    for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
      const turn = await gateway.runToolTurn({
        system,
        prompt,
        tools,
        history,
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      });

      if (turn.kind === "no_tool_call") {
        invalidAttempts++;
        if (invalidAttempts > MAX_RETRIES_ON_INVALID) {
          return { verdict: null, llmStatus: "invalid_output", stepsTaken };
        }
        continue;
      }

      const submitCall = turn.calls.find((call) => call.name === "submit_verdict");
      if (submitCall) {
        const parsed = parseVerdict(submitCall.argsJson, request.content);
        if (!parsed) {
          invalidAttempts++;
          if (invalidAttempts > MAX_RETRIES_ON_INVALID) {
            return { verdict: null, llmStatus: "invalid_output", stepsTaken };
          }
          history.push({ role: "assistant", toolCalls: [submitCall] });
          history.push({
            role: "tool",
            toolCallId: submitCall.id,
            name: "submit_verdict",
            resultJson: JSON.stringify({
              error: "Invalid verdict — check that all required fields are present and evidence offsets fall within the content you were given, then call submit_verdict again.",
            }),
          });
          continue;
        }

        if (request.cache) await request.cache.set(cacheKey, { verdict: parsed, modelTag });
        return { verdict: toInvestigatorVerdict(parsed, modelTag), llmStatus: "ok", stepsTaken };
      }

      // Investigative tool calls (decode / rescan / getSessionHistory / getSourceProfile).
      history.push({ role: "assistant", toolCalls: turn.calls });

      if (investigativeToolCalls >= MAX_INVESTIGATIVE_TOOL_CALLS) {
        for (const call of turn.calls) {
          history.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            resultJson: JSON.stringify({ error: "Tool call budget exhausted — call submit_verdict now with your best assessment." }),
          });
        }
        continue;
      }

      for (const call of turn.calls) {
        const result = await executeTool(call, request.tools);
        stepsTaken.push(`${call.name}(${call.argsJson})`);
        investigativeToolCalls++;
        history.push({ role: "tool", toolCallId: call.id, name: call.name, resultJson: JSON.stringify(result) });
      }
    }

    return { verdict: null, llmStatus: "invalid_output", stepsTaken };
  } catch {
    // Network errors, timeouts, provider outages — anything the gateway
    // itself throws. Fail safe: the escalation router treats this the same
    // as "the LLM wasn't available," never as a reason to relax the score.
    return { verdict: null, llmStatus: "unavailable", stepsTaken };
  }
}

function parseVerdict(argsJson: string, content: string): LlmVerdict | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argsJson);
  } catch {
    return null;
  }

  const result = llmVerdictSchema.safeParse(parsed);
  if (!result.success) return null;

  for (const span of result.data.evidence) {
    if (span.start < 0 || span.end > content.length || span.start > span.end) return null;
  }

  return result.data;
}

async function executeTool(call: RequestedToolCall, tools: InvestigatorTools): Promise<unknown> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.argsJson) as Record<string, unknown>;
  } catch {
    return { error: "invalid tool arguments JSON" };
  }

  try {
    switch (call.name) {
      case "decode":
        return await tools.decode(String(args.text ?? ""));
      case "rescan":
        return await tools.rescan(String(args.text ?? ""));
      case "getSessionHistory":
        return await tools.getSessionHistory();
      case "getSourceProfile":
        return await tools.getSourceProfile(String(args.origin ?? ""));
      default:
        return { error: `unknown tool: ${call.name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "tool execution failed" };
  }
}

function toInvestigatorVerdict(verdict: LlmVerdict, modelTag: string): InvestigatorVerdict {
  return { ...verdict, modelTag };
}
