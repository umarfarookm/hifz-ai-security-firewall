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
const DEFAULT_MAX_RETRIES_ON_INVALID = 1;
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
  /** From LLM_TEMPERATURE — omit to use the gateway's own default (0, deterministic-as-possible). */
  temperature?: number;
  /** From LLM_MAX_RETRIES — retries on a no-tool-call or invalid submit_verdict reply. Defaults to 1. */
  maxRetries?: number;
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
  const maxRetries = request.maxRetries ?? DEFAULT_MAX_RETRIES_ON_INVALID;

  try {
    for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
      const turn = await gateway.runToolTurn({
        system,
        prompt,
        tools,
        history,
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      });

      if (turn.kind === "no_tool_call") {
        invalidAttempts++;
        if (invalidAttempts > maxRetries) {
          return { verdict: null, llmStatus: "invalid_output", stepsTaken };
        }
        continue;
      }

      const submitCall = turn.calls.find((call) => call.name === "submit_verdict");
      if (submitCall) {
        const parsed = parseVerdict(submitCall.argsJson, request.content);
        if (!parsed) {
          invalidAttempts++;
          if (invalidAttempts > maxRetries) {
            return { verdict: null, llmStatus: "invalid_output", stepsTaken };
          }
          history.push({ role: "assistant", toolCalls: [submitCall] });
          history.push({
            role: "tool",
            toolCallId: submitCall.id,
            name: "submit_verdict",
            resultJson: JSON.stringify({
              error: "Invalid verdict — check that all required fields are present and have the right types, then call submit_verdict again.",
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

  return { ...result.data, evidence: repairEvidence(result.data.evidence, content) };
}

/**
 * Models are unreliable at counting characters: a correct verdict often arrives with evidence offsets that
 * are off by a few positions or run past the end. The offsets only drive UI highlighting, so rather than
 * discard a sound verdict, re-anchor each span by locating its excerpt in the content (nearest occurrence to
 * the claimed start), and drop only the spans that cannot be located. Nothing here loosens what the verdict
 * is allowed to do — the schema check above is unchanged and the band can still only be raised.
 */
function repairEvidence(spans: LlmVerdict["evidence"], content: string): LlmVerdict["evidence"] {
  const repaired: LlmVerdict["evidence"] = [];

  for (const span of spans) {
    const inRange = span.start >= 0 && span.start <= span.end && span.end <= content.length;
    if (inRange && content.slice(span.start, span.end) === span.excerpt) {
      repaired.push(span);
      continue;
    }

    const at = nearestOccurrence(content, span.excerpt, span.start);
    if (at !== -1) {
      repaired.push({ ...span, start: at, end: at + span.excerpt.length });
      continue;
    }

    // Decoded/hidden-layer text is not part of `content`, so its excerpt can't be located here; keep the span
    // only if its offsets are at least sane.
    if (inRange && span.layer !== "visible") repaired.push(span);
  }

  return repaired;
}

/** Index of the occurrence of `needle` in `haystack` closest to `near`, or -1 if there is none. */
function nearestOccurrence(haystack: string, needle: string, near: number): number {
  if (needle.length === 0) return -1;
  let best = -1;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    if (best === -1 || Math.abs(at - near) < Math.abs(best - near)) best = at;
  }
  return best;
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
