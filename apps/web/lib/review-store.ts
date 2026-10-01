import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_IDS_KEY, type InMemoryAuditWriter } from "./audit.js";

/**
 * Human review queue storage — docs/architecture/LLD.md §3.11.
 *
 * A review item is created by a REVIEW decision (kind "content", ref = inspection id) or a REQUIRE_APPROVAL
 * guard outcome (kind "tool_call", ref = tool_calls id). States: PENDING → APPROVED | REJECTED, or EXPIRED when
 * nobody decides within the item's `expires_at` (15 minutes by default, set in the schema). EXPIRED is not
 * stored: it is derived on read, so no background job is needed, and a late decision is refused.
 */
export type ReviewKind = "content" | "tool_call";
export type ReviewState = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
export type ReviewDecision = "APPROVED" | "REJECTED";

export type ReviewSummary =
  | {
      type: "content";
      decision: string;
      finalBand: string;
      score: number;
      reason: string;
      excerpt: string;
      attackTypes: string[];
    }
  | {
      type: "tool_call";
      tool: string;
      to: string | null;
      preview: string | null;
      failedCheck: { checkId: string; detail: string } | null;
      triggeredBy: string[];
    };

export interface ReviewItem {
  id: string;
  kind: ReviewKind;
  refId: string;
  /** Effective state: a PENDING item past its expiry reads as EXPIRED. */
  state: ReviewState;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  comment: string | null;
  summary: ReviewSummary | null;
}

export type DecideResult = { ok: true; item: ReviewItem } | { ok: false; reason: "not_found" | "already_decided" | "expired" };

export interface ReviewStore {
  /** Creates a PENDING review for a content decision of REVIEW. */
  createForContent(inspectionId: string): Promise<string>;
  /** Creates a PENDING review for a REQUIRE_APPROVAL tool call and links it from the tool call row. */
  createForToolCall(toolCallId: string): Promise<string>;
  /** Newest first. `state` filters on the effective state. */
  list(options: { state?: ReviewState; limit: number }): Promise<ReviewItem[]>;
  get(id: string): Promise<ReviewItem | null>;
  /** Records a decision, only if the item is still PENDING and not expired. */
  decide(id: string, input: { decision: ReviewDecision; reviewerId: string; comment: string | null }): Promise<DecideResult>;
}

export const REVIEW_TTL_MS = 15 * 60_000;

export function effectiveState(state: ReviewState, expiresAt: string, nowMs: number): ReviewState {
  return state === "PENDING" && new Date(expiresAt).getTime() <= nowMs ? "EXPIRED" : state;
}

/** The first guard check that did not pass — the reason a tool call needs approval. */
function failedCheckOf(checks: unknown): { checkId: string; detail: string } | null {
  if (!Array.isArray(checks)) return null;
  const failed = checks.find((c) => c && typeof c === "object" && (c as { passed?: unknown }).passed === false) as
    | { checkId?: unknown; detail?: unknown }
    | undefined;
  return failed ? { checkId: String(failed.checkId ?? ""), detail: String(failed.detail ?? "") } : null;
}

function toolCallSummary(row: { tool: string; args_redacted: unknown; checks: unknown }): ReviewSummary {
  const args = (row.args_redacted && typeof row.args_redacted === "object" ? row.args_redacted : {}) as Record<string, unknown>;
  const triggeredBy = Array.isArray(args[CONTENT_IDS_KEY]) ? (args[CONTENT_IDS_KEY] as unknown[]).map(String) : [];
  const body = typeof args.body === "string" ? args.body : typeof args.text === "string" ? args.text : null;
  return {
    type: "tool_call",
    tool: row.tool,
    to: typeof args.to === "string" ? args.to : null,
    preview: body ? (body.length > 240 ? `${body.slice(0, 240)}…` : body) : null,
    failedCheck: failedCheckOf(row.checks),
    triggeredBy,
  };
}

interface ReviewRow {
  id: string;
  kind: ReviewKind;
  ref_id: string;
  state: ReviewState;
  comment: string | null;
  created_at: string;
  decided_at: string | null;
  expires_at: string;
}

const REVIEW_COLUMNS = "id, kind, ref_id, state, comment, created_at, decided_at, expires_at";

function toItem(row: ReviewRow, summary: ReviewSummary | null, nowMs: number): ReviewItem {
  return {
    id: row.id,
    kind: row.kind,
    refId: row.ref_id,
    state: effectiveState(row.state, row.expires_at, nowMs),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    decidedAt: row.decided_at,
    comment: row.comment,
    summary,
  };
}

export class SupabaseReviewStore implements ReviewStore {
  constructor(
    private readonly client: SupabaseClient,
    private readonly now: () => number = Date.now,
  ) {}

  async createForContent(inspectionId: string): Promise<string> {
    const { data, error } = await this.client.from("reviews").insert({ kind: "content", ref_id: inspectionId }).select("id").single();
    if (error || !data) throw new Error(`createForContent failed: ${error?.message}`);
    return data.id as string;
  }

  async createForToolCall(toolCallId: string): Promise<string> {
    const { data, error } = await this.client.from("reviews").insert({ kind: "tool_call", ref_id: toolCallId }).select("id").single();
    if (error || !data) throw new Error(`createForToolCall failed: ${error?.message}`);
    const reviewId = data.id as string;
    const { error: linkError } = await this.client.from("tool_calls").update({ review_id: reviewId }).eq("id", toolCallId);
    if (linkError) throw new Error(`linking review to tool call failed: ${linkError.message}`);
    return reviewId;
  }

  async list(options: { state?: ReviewState; limit: number }): Promise<ReviewItem[]> {
    const { data, error } = await this.client.from("reviews").select(REVIEW_COLUMNS).order("created_at", { ascending: false }).limit(options.limit);
    if (error) throw new Error(`list reviews failed: ${error.message}`);
    const rows = (data ?? []) as ReviewRow[];
    const summaries = await this.summaries(rows);
    const nowMs = this.now();
    const items = rows.map((row) => toItem(row, summaries.get(row.id) ?? null, nowMs));
    return options.state ? items.filter((item) => item.state === options.state) : items;
  }

  async get(id: string): Promise<ReviewItem | null> {
    const { data, error } = await this.client.from("reviews").select(REVIEW_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw new Error(`get review failed: ${error.message}`);
    if (!data) return null;
    const row = data as ReviewRow;
    return toItem(row, (await this.summaries([row])).get(row.id) ?? null, this.now());
  }

  async decide(id: string, input: { decision: ReviewDecision; reviewerId: string; comment: string | null }): Promise<DecideResult> {
    const nowIso = new Date(this.now()).toISOString();
    // One conditional update decides atomically: only a still-PENDING, unexpired item can be decided, so two
    // reviewers racing, or a late click after expiry, cannot both succeed.
    const { data, error } = await this.client
      .from("reviews")
      .update({ state: input.decision, reviewer_id: input.reviewerId, comment: input.comment, decided_at: nowIso })
      .eq("id", id)
      .eq("state", "PENDING")
      .gt("expires_at", nowIso)
      .select(REVIEW_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`decide review failed: ${error.message}`);

    if (data) {
      const row = data as ReviewRow;
      return { ok: true, item: toItem(row, (await this.summaries([row])).get(row.id) ?? null, this.now()) };
    }

    const existing = await this.get(id);
    if (!existing) return { ok: false, reason: "not_found" };
    return { ok: false, reason: existing.state === "EXPIRED" ? "expired" : "already_decided" };
  }

  /** Joins each review to the thing it is about, in two queries total regardless of how many rows. */
  private async summaries(rows: ReviewRow[]): Promise<Map<string, ReviewSummary>> {
    const out = new Map<string, ReviewSummary>();
    const contentRows = rows.filter((r) => r.kind === "content");
    const toolRows = rows.filter((r) => r.kind === "tool_call");

    if (contentRows.length > 0) {
      const ids = contentRows.map((r) => r.ref_id);
      const [{ data: inspections }, { data: signals }] = await Promise.all([
        this.client.from("inspections").select("id, action, final_band, score, reason, content_excerpt").in("id", ids),
        this.client.from("signals").select("inspection_id, attack_type").in("inspection_id", ids),
      ]);
      const types = new Map<string, Set<string>>();
      for (const s of signals ?? []) {
        const set = types.get(s.inspection_id as string) ?? new Set<string>();
        set.add(s.attack_type as string);
        types.set(s.inspection_id as string, set);
      }
      for (const i of inspections ?? []) {
        const review = contentRows.find((r) => r.ref_id === i.id);
        if (!review) continue;
        out.set(review.id, {
          type: "content",
          decision: i.action as string,
          finalBand: i.final_band as string,
          score: i.score as number,
          reason: i.reason as string,
          excerpt: i.content_excerpt as string,
          attackTypes: [...(types.get(i.id as string) ?? [])],
        });
      }
    }

    if (toolRows.length > 0) {
      const { data: calls } = await this.client
        .from("tool_calls")
        .select("id, tool, args_redacted, checks")
        .in(
          "id",
          toolRows.map((r) => r.ref_id),
        );
      for (const c of calls ?? []) {
        const review = toolRows.find((r) => r.ref_id === c.id);
        if (review) out.set(review.id, toolCallSummary(c as { tool: string; args_redacted: unknown; checks: unknown }));
      }
    }
    return out;
  }
}

/** Test double that enforces the same rules as the database: single decision, expiry, and the PENDING-only update. */
export class InMemoryReviewStore implements ReviewStore {
  private readonly rows: Array<ReviewRow & { reviewer_id: string | null }> = [];

  constructor(
    private readonly audit: InMemoryAuditWriter,
    private readonly now: () => number = Date.now,
  ) {}

  async createForContent(inspectionId: string): Promise<string> {
    return this.insert("content", inspectionId);
  }

  async createForToolCall(toolCallId: string): Promise<string> {
    const id = this.insert("tool_call", toolCallId);
    const call = this.audit.toolCalls.find((c) => c.id === toolCallId);
    if (call) call.reviewId = id;
    return id;
  }

  private insert(kind: ReviewKind, refId: string): string {
    const created = this.now();
    const id = randomUUID();
    this.rows.push({
      id,
      kind,
      ref_id: refId,
      state: "PENDING",
      comment: null,
      created_at: new Date(created).toISOString(),
      decided_at: null,
      expires_at: new Date(created + REVIEW_TTL_MS).toISOString(),
      reviewer_id: null,
    });
    return id;
  }

  private summary(row: ReviewRow): ReviewSummary | null {
    if (row.kind === "content") {
      const inspection = this.audit.inspections.find((i) => i.id === row.ref_id);
      if (!inspection) return null;
      const signals = this.audit.signals.filter((s) => s.inspectionId === row.ref_id).flatMap((s) => s.signals);
      return {
        type: "content",
        decision: inspection.decision.action,
        finalBand: inspection.finalBand,
        score: inspection.score,
        reason: inspection.decision.reason,
        excerpt: inspection.contentExcerpt,
        attackTypes: [...new Set(signals.map((s) => s.attackType))],
      };
    }
    const call = this.audit.toolCalls.find((c) => c.id === row.ref_id);
    return call ? toolCallSummary({ tool: call.tool, args_redacted: { ...call.argsRedacted, [CONTENT_IDS_KEY]: call.triggeringContentIds }, checks: call.checks }) : null;
  }

  async list(options: { state?: ReviewState; limit: number }): Promise<ReviewItem[]> {
    const nowMs = this.now();
    const items = [...this.rows]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, options.limit)
      .map((row) => toItem(row, this.summary(row), nowMs));
    return options.state ? items.filter((item) => item.state === options.state) : items;
  }

  async get(id: string): Promise<ReviewItem | null> {
    const row = this.rows.find((r) => r.id === id);
    return row ? toItem(row, this.summary(row), this.now()) : null;
  }

  async decide(id: string, input: { decision: ReviewDecision; reviewerId: string; comment: string | null }): Promise<DecideResult> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return { ok: false, reason: "not_found" };
    const state = effectiveState(row.state, row.expires_at, this.now());
    if (state === "EXPIRED") return { ok: false, reason: "expired" };
    if (state !== "PENDING") return { ok: false, reason: "already_decided" };
    row.state = input.decision;
    row.reviewer_id = input.reviewerId;
    row.comment = input.comment;
    row.decided_at = new Date(this.now()).toISOString();
    return { ok: true, item: toItem(row, this.summary(row), this.now()) };
  }
}
