import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ingestAdapters,
  normalize,
  recursivelyDecode,
  runDetectors,
  scoreRisk,
  type AttackType,
  type ContentType,
  type LlmStatus,
  type PolicyAction,
  type ProvenanceSource,
  type RiskBand,
  type TrustLevel,
} from "@hifz/firewall-core";
import type { InvestigatorTools, ModelGateway } from "@hifz/agents";
import { runEscalation } from "@hifz/agents";
import type { AuditWriter } from "./audit.js";
import { decideStubPolicy } from "./policy-stub.js";

const MAX_INPUT_BYTES = 100 * 1024;

const inspectRequestSchema = z.object({
  content: z.string().min(1),
  contentType: z.enum(["text", "markdown", "html", "email", "json", "source_code", "pdf", "docx"]),
  source: z.enum(["user_message", "web_page", "email", "api_response", "document", "tool_output"]),
  origin: z.string().optional(),
  sessionId: z.string().optional(),
});

export type InspectRequestBody = z.infer<typeof inspectRequestSchema>;

export interface InspectResponseBody {
  decision: PolicyAction;
  finalBand: RiskBand;
  score: number;
  attackTypes: string[];
  reason: string;
  sanitizedContent: string | null;
  eventId: string;
  llmStatus: LlmStatus;
  timings: Record<string, number>;
}

export type InspectOutcome =
  | { kind: "success"; correlationId: string; body: InspectResponseBody }
  | { kind: "validation_error"; correlationId: string; issues: string[] }
  | { kind: "too_large"; correlationId: string }
  | { kind: "pipeline_error"; correlationId: string; message: string };

// Trust defaults per docs/architecture/LLD.md §2.1.
function trustFor(source: ProvenanceSource): TrustLevel {
  return source === "user_message" ? "semi_trusted" : "untrusted";
}

export interface RunInspectionDeps {
  audit: AuditWriter;
  /** Pass the raw createModelGateway("investigator", env) result — a "none"-provider gateway is treated as rules-only. */
  gateway: ModelGateway;
  escalationBand: { min: number; max: number };
  failureMode: "review" | "block";
  detectorVersion: string;
}

export async function runInspection(rawBody: unknown, deps: RunInspectionDeps): Promise<InspectOutcome> {
  const correlationId = randomUUID();

  const parsed = inspectRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      correlationId,
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const body = parsed.data;

  if (Buffer.byteLength(body.content, "utf8") > MAX_INPUT_BYTES) {
    return { kind: "too_large", correlationId };
  }

  const timings: Record<string, number> = {};
  const timeStage = <T>(name: string, fn: () => T): T => {
    const start = process.hrtime.bigint();
    const result = fn();
    timings[name] = Number(process.hrtime.bigint() - start) / 1_000_000;
    return result;
  };

  try {
    const sessionId = await deps.audit.ensureSession(body.sessionId);
    const trust = trustFor(body.source);

    const adapter = ingestAdapters[body.contentType as ContentType];
    if (!adapter) {
      return { kind: "validation_error", correlationId, issues: [`no ingest adapter for contentType "${body.contentType}" yet`] };
    }

    const ingested = timeStage("ingest", () => adapter(body.content));
    const normalized = timeStage("normalize", () => normalize(ingested));
    const signals = timeStage("detect", () => runDetectors(normalized));
    const riskAssessment = timeStage("score", () => scoreRisk({ signals, sourceTrust: trust, sessionRisk: 0 }));

    const escalationStart = process.hrtime.bigint();
    const escalation = await runEscalation({
      riskAssessment,
      escalationBand: deps.escalationBand,
      gateway: deps.gateway.metadata.provider === "none" ? null : deps.gateway,
      failureMode: deps.failureMode,
      investigatorRequest: {
        content: normalized.visibleText,
        tools: buildInvestigatorTools(deps.audit),
        detectorVersion: deps.detectorVersion,
      },
    });
    timings.investigate = Number(process.hrtime.bigint() - escalationStart) / 1_000_000;

    const policy = decideStubPolicy({
      finalBand: escalation.finalBand,
      trust,
      failSafeAction: escalation.failSafeAction,
    });

    const contentHash = createHash("sha256").update(body.content).digest("hex");
    const contentExcerpt = body.content.length > 2000 ? body.content.slice(0, 2000) : body.content;

    const inspectionId = await deps.audit.writeInspection({
      correlationId,
      sessionId,
      contentType: body.contentType,
      source: body.source,
      trust,
      origin: body.origin ?? null,
      contentHash,
      contentExcerpt,
      score: riskAssessment.score,
      ruleBand: riskAssessment.band,
      finalBand: escalation.finalBand,
      decision: {
        action: policy.action,
        policyRuleId: policy.policyRuleId,
        reason: policy.reason,
        sanitizedContent: null,
        finalBand: escalation.finalBand,
        llmStatus: escalation.llmStatus,
      },
      timings,
    });

    await deps.audit.writeSignals(inspectionId, signals);

    if (escalation.verdict) {
      await deps.audit.writeLlmVerdict(inspectionId, {
        modelTag: escalation.verdict.modelTag,
        verdict: escalation.verdict,
        steps: escalation.stepsTaken,
        latencyMs: timings.investigate ?? 0,
        status: escalation.llmStatus,
      });
    }

    const attackTypes = [...new Set(signals.map((s) => s.attackType))];

    return {
      kind: "success",
      correlationId,
      body: {
        decision: policy.action,
        finalBand: escalation.finalBand,
        score: riskAssessment.score,
        attackTypes,
        reason: policy.reason,
        sanitizedContent: null,
        eventId: inspectionId,
        llmStatus: escalation.llmStatus,
        timings,
      },
    };
  } catch (err) {
    return { kind: "pipeline_error", correlationId, message: err instanceof Error ? err.message : String(err) };
  }
}

function buildInvestigatorTools(audit: AuditWriter): InvestigatorTools {
  return {
    decode: (text: string) => {
      const { layers } = recursivelyDecode(text, "visible", { bytesUsed: 0 });
      const first = layers[0];
      return first ? { encoding: first.encoding, decoded: first.text } : { encoding: null, decoded: null };
    },
    rescan: (text: string) => {
      const signals = runDetectors({ visibleText: text, hiddenSegments: [], decodedLayers: [], transforms: [], anomalies: [] });
      return { signals };
    },
    getSessionHistory: async (sessionId: string) => {
      const history = await audit.getSessionHistory(sessionId);
      return history.map((h) => ({ band: h.band, attackTypes: h.attackTypes as AttackType[] }));
    },
    getSourceProfile: (origin: string) => audit.getSourceProfile(origin),
  };
}
