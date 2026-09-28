import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ContentType,
  Decision,
  GuardDecision,
  InvestigatorVerdict,
  PolicyAction,
  ProvenanceSource,
  RiskBand,
  ScoreContribution,
  Signal,
  TrustLevel,
} from "@hifz/firewall-core";

/**
 * Everything the API routes need to write to Supabase, behind an
 * interface — so route logic (inspect.ts, agent-run.ts) stays unit
 * testable with an in-memory fake instead of a live database.
 * Table shapes: supabase/migrations/20260924000001_initial_schema.sql.
 */
export interface AuditWriter {
  /** Inserts the session row if it doesn't exist yet. Returns the resolved session UUID. */
  ensureSession(sessionId?: string): Promise<string>;

  writeInspection(record: InspectionRecord): Promise<string>;
  writeSignals(inspectionId: string, signals: Signal[]): Promise<void>;
  writeLlmVerdict(inspectionId: string, record: LlmVerdictRecord): Promise<void>;
  writeToolCall(record: ToolCallRecord): Promise<string>;

  /** Count of tool_calls for this session, among `toolNames`, in the last `windowMinutes` — seeds the Action Guard's G6 rate limit so it holds across separate /agent/run calls in the same session, not just within one run. */
  countRecentToolCalls(sessionId: string, toolNames: string[], windowMinutes: number): Promise<number>;

  /** Last 10 decisions for a session — bands and attack types only, no raw content (LLD §3.6). */
  getSessionHistory(sessionId: string): Promise<{ band: RiskBand; attackTypes: string[] }[]>;
  /** Trust level + prior incident count for a content origin (LLD §3.6's getSourceProfile tool). */
  getSourceProfile(origin: string): Promise<{ trust: TrustLevel; priorIncidentCount: number }>;

  /** GET /events (LLD §4) — newest first, cursor-paginated. */
  listEvents(filter: EventListFilter): Promise<EventListPage>;
  /** GET /events/{id} (LLD §4) — full evidence for one inspection, or null if it doesn't exist. */
  getEventDetail(id: string): Promise<EventDetail | null>;
}

export interface EventListFilter {
  band?: RiskBand;
  action?: PolicyAction;
  attackType?: string;
  since?: string;
  limit: number;
  /** Opaque cursor from a previous page's `nextCursor` — an ISO timestamp under the hood. */
  cursor?: string;
}

export interface EventSummary {
  id: string;
  createdAt: string;
  contentType: ContentType;
  source: ProvenanceSource;
  trust: TrustLevel;
  score: number;
  finalBand: RiskBand;
  action: PolicyAction;
  attackTypes: string[];
}

export interface EventListPage {
  items: EventSummary[];
  nextCursor: string | null;
}

export interface EventDetail extends EventSummary {
  reason: string;
  policyRuleId: string;
  contentExcerpt: string;
  timings: Record<string, number>;
  contributions: ScoreContribution[];
  signals: { detectorId: string; attackType: string; severity: string; confidence: number; layer: string; evidence: unknown }[];
  verdict: { modelTag: string; verdict: InvestigatorVerdict; steps: string[]; latencyMs: number; status: Decision["llmStatus"] } | null;
  toolCalls: { tool: string; outcome: GuardDecision["outcome"]; checks: GuardDecision["checks"] }[];
}

export interface InspectionRecord {
  correlationId: string;
  sessionId: string;
  contentType: ContentType;
  source: ProvenanceSource;
  trust: TrustLevel;
  origin: string | null;
  contentHash: string;
  contentExcerpt: string;
  score: number;
  ruleBand: RiskBand;
  finalBand: RiskBand;
  decision: Decision;
  timings: Record<string, number>;
  contributions: ScoreContribution[];
}

export interface LlmVerdictRecord {
  modelTag: string;
  verdict: InvestigatorVerdict;
  steps: string[];
  latencyMs: number;
  status: Decision["llmStatus"];
}

export interface ToolCallRecord {
  sessionId: string;
  tool: string;
  argsRedacted: Record<string, unknown>;
  triggeringInspectionIds: string[];
  outcome: GuardDecision["outcome"];
  checks: GuardDecision["checks"];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SupabaseAuditWriter implements AuditWriter {
  constructor(private readonly client: SupabaseClient) {}

  async ensureSession(sessionId?: string): Promise<string> {
    const id = sessionId && UUID_PATTERN.test(sessionId) ? sessionId : randomUUID();
    const { error } = await this.client.from("sessions").upsert({ id }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`ensureSession failed: ${error.message}`);
    return id;
  }

  async writeInspection(record: InspectionRecord): Promise<string> {
    const { data, error } = await this.client
      .from("inspections")
      .insert({
        correlation_id: record.correlationId,
        session_id: record.sessionId,
        content_type: record.contentType,
        source: record.source,
        trust: record.trust,
        origin: record.origin,
        content_hash: record.contentHash,
        content_excerpt: record.contentExcerpt,
        score: record.score,
        rule_band: record.ruleBand,
        final_band: record.finalBand,
        action: record.decision.action,
        policy_rule_id: record.decision.policyRuleId,
        reason: record.decision.reason,
        llm_status: record.decision.llmStatus,
        timings: record.timings,
        contributions: record.contributions,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`writeInspection failed: ${error?.message}`);
    return data.id as string;
  }

  async writeSignals(inspectionId: string, signals: Signal[]): Promise<void> {
    if (signals.length === 0) return;
    const { error } = await this.client.from("signals").insert(
      signals.map((signal) => ({
        inspection_id: inspectionId,
        detector_id: signal.detectorId,
        attack_type: signal.attackType,
        severity: signal.severity,
        confidence: signal.confidence,
        layer: signal.evidence[0]?.layer ?? "visible",
        evidence: signal.evidence,
      })),
    );
    if (error) throw new Error(`writeSignals failed: ${error.message}`);
  }

  async writeLlmVerdict(inspectionId: string, record: LlmVerdictRecord): Promise<void> {
    const { error } = await this.client.from("llm_verdicts").insert({
      inspection_id: inspectionId,
      model_tag: record.modelTag,
      verdict: record.verdict,
      steps: record.steps,
      latency_ms: record.latencyMs,
      status: record.status,
    });
    if (error) throw new Error(`writeLlmVerdict failed: ${error.message}`);
  }

  async writeToolCall(record: ToolCallRecord): Promise<string> {
    const { data, error } = await this.client
      .from("tool_calls")
      .insert({
        session_id: record.sessionId,
        tool: record.tool,
        args_redacted: record.argsRedacted,
        triggering_inspection_ids: record.triggeringInspectionIds,
        outcome: record.outcome,
        checks: record.checks,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`writeToolCall failed: ${error?.message}`);
    return data.id as string;
  }

  async countRecentToolCalls(sessionId: string, toolNames: string[], windowMinutes: number): Promise<number> {
    if (toolNames.length === 0) return 0;
    const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
    const { count, error } = await this.client
      .from("tool_calls")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .in("tool", toolNames)
      .gte("created_at", since);
    if (error) throw new Error(`countRecentToolCalls failed: ${error.message}`);
    return count ?? 0;
  }

  async getSessionHistory(sessionId: string): Promise<{ band: RiskBand; attackTypes: string[] }[]> {
    const { data: inspections } = await this.client
      .from("inspections")
      .select("id, final_band")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (!inspections || inspections.length === 0) return [];

    const ids = inspections.map((i) => i.id as string);
    const { data: signalRows } = await this.client.from("signals").select("inspection_id, attack_type").in("inspection_id", ids);

    const attackTypesByInspection = new Map<string, string[]>();
    for (const row of signalRows ?? []) {
      const list = attackTypesByInspection.get(row.inspection_id as string) ?? [];
      if (!list.includes(row.attack_type as string)) list.push(row.attack_type as string);
      attackTypesByInspection.set(row.inspection_id as string, list);
    }

    return inspections.map((i) => ({
      band: i.final_band as RiskBand,
      attackTypes: attackTypesByInspection.get(i.id as string) ?? [],
    }));
  }

  async getSourceProfile(origin: string): Promise<{ trust: TrustLevel; priorIncidentCount: number }> {
    const { count } = await this.client
      .from("inspections")
      .select("id", { count: "exact", head: true })
      .eq("origin", origin)
      .in("action", ["BLOCK", "REVIEW"]);
    // Trust here follows the fixed defaults in LLD §2.1 (everything external
    // is untrusted) rather than a per-origin lookup — kept simple on purpose.
    return { trust: "untrusted", priorIncidentCount: count ?? 0 };
  }

  async listEvents(filter: EventListFilter): Promise<EventListPage> {
    let query = this.client
      .from("inspections")
      .select("id, created_at, content_type, source, trust, score, final_band, action")
      .order("created_at", { ascending: false })
      .limit(filter.limit + 1);

    if (filter.band) query = query.eq("final_band", filter.band);
    if (filter.action) query = query.eq("action", filter.action);
    if (filter.since) query = query.gte("created_at", filter.since);
    if (filter.cursor) query = query.lt("created_at", filter.cursor);

    const { data: rows, error } = await query;
    if (error) throw new Error(`listEvents failed: ${error.message}`);
    const inspections = rows ?? [];

    const ids = inspections.map((i) => i.id as string);
    const attackTypesByInspection = await this.attackTypesByInspectionId(ids);

    let items: EventSummary[] = inspections.map((i) => ({
      id: i.id as string,
      createdAt: i.created_at as string,
      contentType: i.content_type as ContentType,
      source: i.source as ProvenanceSource,
      trust: i.trust as TrustLevel,
      score: i.score as number,
      finalBand: i.final_band as RiskBand,
      action: i.action as PolicyAction,
      attackTypes: attackTypesByInspection.get(i.id as string) ?? [],
    }));

    if (filter.attackType) {
      items = items.filter((item) => item.attackTypes.includes(filter.attackType!));
    }

    const hasMore = items.length > filter.limit;
    const page = items.slice(0, filter.limit);
    return { items: page, nextCursor: hasMore ? page[page.length - 1]!.createdAt : null };
  }

  async getEventDetail(id: string): Promise<EventDetail | null> {
    const { data: inspection, error } = await this.client
      .from("inspections")
      .select(
        "id, created_at, content_type, source, trust, score, final_band, action, reason, policy_rule_id, content_excerpt, timings, contributions, session_id",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`getEventDetail failed: ${error.message}`);
    if (!inspection) return null;

    const [attackTypesByInspection, { data: signalRows }, { data: verdictRow }, { data: toolCallRows }] = await Promise.all([
      this.attackTypesByInspectionId([id]),
      this.client.from("signals").select("detector_id, attack_type, severity, confidence, layer, evidence").eq("inspection_id", id),
      this.client
        .from("llm_verdicts")
        .select("model_tag, verdict, steps, latency_ms, status")
        .eq("inspection_id", id)
        .maybeSingle(),
      inspection.session_id
        ? this.client
            .from("tool_calls")
            .select("tool, outcome, checks")
            .contains("triggering_inspection_ids", [id])
        : Promise.resolve({ data: [] as { tool: string; outcome: string; checks: unknown }[] }),
    ]);

    return {
      id: inspection.id as string,
      createdAt: inspection.created_at as string,
      contentType: inspection.content_type as ContentType,
      source: inspection.source as ProvenanceSource,
      trust: inspection.trust as TrustLevel,
      score: inspection.score as number,
      finalBand: inspection.final_band as RiskBand,
      action: inspection.action as PolicyAction,
      reason: inspection.reason as string,
      policyRuleId: inspection.policy_rule_id as string,
      contentExcerpt: inspection.content_excerpt as string,
      timings: (inspection.timings as Record<string, number>) ?? {},
      contributions: (inspection.contributions as ScoreContribution[]) ?? [],
      attackTypes: attackTypesByInspection.get(id) ?? [],
      signals: (signalRows ?? []).map((s) => ({
        detectorId: s.detector_id as string,
        attackType: s.attack_type as string,
        severity: s.severity as string,
        confidence: s.confidence as number,
        layer: s.layer as string,
        evidence: s.evidence,
      })),
      verdict: verdictRow
        ? {
            modelTag: verdictRow.model_tag as string,
            verdict: verdictRow.verdict as InvestigatorVerdict,
            steps: verdictRow.steps as string[],
            latencyMs: verdictRow.latency_ms as number,
            status: verdictRow.status as Decision["llmStatus"],
          }
        : null,
      toolCalls: (toolCallRows ?? []).map((t) => ({
        tool: t.tool as string,
        outcome: t.outcome as GuardDecision["outcome"],
        checks: t.checks as GuardDecision["checks"],
      })),
    };
  }

  private async attackTypesByInspectionId(ids: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (ids.length === 0) return map;
    const { data: signalRows } = await this.client.from("signals").select("inspection_id, attack_type").in("inspection_id", ids);
    for (const row of signalRows ?? []) {
      const list = map.get(row.inspection_id as string) ?? [];
      if (!list.includes(row.attack_type as string)) list.push(row.attack_type as string);
      map.set(row.inspection_id as string, list);
    }
    return map;
  }
}

/** In-memory AuditWriter for tests — no network, no Supabase project needed. */
export class InMemoryAuditWriter implements AuditWriter {
  public readonly inspections: (InspectionRecord & { id: string })[] = [];
  public readonly signals: { inspectionId: string; signals: Signal[] }[] = [];
  public readonly llmVerdicts: { inspectionId: string; record: LlmVerdictRecord }[] = [];
  public readonly toolCalls: (ToolCallRecord & { id: string; createdAt: Date })[] = [];
  public readonly sessions = new Set<string>();

  async ensureSession(sessionId?: string): Promise<string> {
    const id = sessionId && UUID_PATTERN.test(sessionId) ? sessionId : randomUUID();
    this.sessions.add(id);
    return id;
  }

  async writeInspection(record: InspectionRecord): Promise<string> {
    const id = randomUUID();
    this.inspections.push({ ...record, id });
    return id;
  }

  async writeSignals(inspectionId: string, signals: Signal[]): Promise<void> {
    this.signals.push({ inspectionId, signals });
  }

  async writeLlmVerdict(inspectionId: string, record: LlmVerdictRecord): Promise<void> {
    this.llmVerdicts.push({ inspectionId, record });
  }

  async writeToolCall(record: ToolCallRecord): Promise<string> {
    const id = randomUUID();
    this.toolCalls.push({ ...record, id, createdAt: new Date() });
    return id;
  }

  async countRecentToolCalls(sessionId: string, toolNames: string[], windowMinutes: number): Promise<number> {
    const since = Date.now() - windowMinutes * 60_000;
    return this.toolCalls.filter(
      (t) => t.sessionId === sessionId && toolNames.includes(t.tool) && t.createdAt.getTime() >= since,
    ).length;
  }

  async getSessionHistory(sessionId: string): Promise<{ band: RiskBand; attackTypes: string[] }[]> {
    return this.inspections
      .filter((i) => i.sessionId === sessionId)
      .slice(-10)
      .reverse()
      .map((i) => ({
        band: i.decision.finalBand,
        attackTypes: [...new Set(this.signals.filter((s) => s.inspectionId === i.id).flatMap((s) => s.signals.map((sig) => sig.attackType)))],
      }));
  }

  async getSourceProfile(origin: string): Promise<{ trust: TrustLevel; priorIncidentCount: number }> {
    const priorIncidentCount = this.inspections.filter(
      (i) => i.origin === origin && (i.decision.action === "BLOCK" || i.decision.action === "REVIEW"),
    ).length;
    return { trust: "untrusted", priorIncidentCount };
  }

  private attackTypesFor(inspectionId: string): string[] {
    return [...new Set(this.signals.filter((s) => s.inspectionId === inspectionId).flatMap((s) => s.signals.map((sig) => sig.attackType)))];
  }

  private toSummary(record: InspectionRecord & { id: string }): EventSummary {
    return {
      id: record.id,
      createdAt: new Date().toISOString(),
      contentType: record.contentType,
      source: record.source,
      trust: record.trust,
      score: record.score,
      finalBand: record.decision.finalBand,
      action: record.decision.action,
      attackTypes: this.attackTypesFor(record.id),
    };
  }

  async listEvents(filter: EventListFilter): Promise<EventListPage> {
    let items = [...this.inspections].reverse().map((r) => this.toSummary(r));
    if (filter.band) items = items.filter((i) => i.finalBand === filter.band);
    if (filter.action) items = items.filter((i) => i.action === filter.action);
    if (filter.attackType) items = items.filter((i) => i.attackTypes.includes(filter.attackType!));

    const hasMore = items.length > filter.limit;
    const page = items.slice(0, filter.limit);
    return { items: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async getEventDetail(id: string): Promise<EventDetail | null> {
    const record = this.inspections.find((i) => i.id === id);
    if (!record) return null;
    const verdictEntry = this.llmVerdicts.find((v) => v.inspectionId === id);
    return {
      ...this.toSummary(record),
      reason: record.decision.reason,
      policyRuleId: record.decision.policyRuleId,
      contentExcerpt: record.contentExcerpt,
      timings: record.timings,
      contributions: record.contributions,
      signals: this.signals
        .filter((s) => s.inspectionId === id)
        .flatMap((s) =>
          s.signals.map((sig) => ({
            detectorId: sig.detectorId,
            attackType: sig.attackType,
            severity: sig.severity,
            confidence: sig.confidence,
            layer: sig.evidence[0]?.layer ?? "visible",
            evidence: sig.evidence,
          })),
        ),
      verdict: verdictEntry
        ? {
            modelTag: verdictEntry.record.modelTag,
            verdict: verdictEntry.record.verdict,
            steps: verdictEntry.record.steps,
            latencyMs: verdictEntry.record.latencyMs,
            status: verdictEntry.record.status,
          }
        : null,
      toolCalls: this.toolCalls
        .filter((t) => t.triggeringInspectionIds.includes(id))
        .map((t) => ({ tool: t.tool, outcome: t.outcome, checks: t.checks })),
    };
  }
}

export type { PolicyAction };
