import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ReviewItem, ReviewState, ReviewStore } from "./review-store.js";

/**
 * Reviewer authentication and the review decision flow — docs/architecture/LLD.md §3.11 and §4.
 *
 * Reading the queue is public (the same model as GET /events: demo data only). Deciding is not: the caller must
 * send a Supabase Auth access token for a user whose server-controlled `app_metadata.role` is "reviewer". That
 * field can only be set with the service key (see packages/eval/src/seed-reviewer.ts); a user cannot edit it, so
 * signing up through the public auth endpoint does not grant it.
 */
export const REVIEWER_ROLE = "reviewer";

export type ReviewerIdentity = { id: string };
export type ReviewerCheck = { kind: "ok"; reviewer: ReviewerIdentity } | { kind: "unauthenticated" } | { kind: "forbidden" };

/** Resolves an access token to a reviewer, distinguishing "who are you?" (401) from "you may not" (403). */
export async function verifyReviewer(client: SupabaseClient, token: string | null): Promise<ReviewerCheck> {
  if (!token) return { kind: "unauthenticated" };
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { kind: "unauthenticated" };
  const role = (data.user.app_metadata as Record<string, unknown> | undefined)?.role;
  return role === REVIEWER_ROLE ? { kind: "ok", reviewer: { id: data.user.id } } : { kind: "forbidden" };
}

export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

const decisionBodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(500).optional(),
});

export type ListOutcome = { kind: "success"; correlationId: string; items: ReviewItem[] } | { kind: "invalid"; correlationId: string; message: string };

const STATES: ReadonlySet<string> = new Set<ReviewState>(["PENDING", "APPROVED", "REJECTED", "EXPIRED"]);
const MAX_LIMIT = 100;

export async function listReviews(store: ReviewStore, params: { state: string | null; limit: string | null }): Promise<ListOutcome> {
  const correlationId = randomUUID();
  if (params.state && !STATES.has(params.state)) {
    return { kind: "invalid", correlationId, message: `state must be one of PENDING, APPROVED, REJECTED, EXPIRED` };
  }
  const limit = params.limit ? Number(params.limit) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return { kind: "invalid", correlationId, message: `limit must be an integer between 1 and ${MAX_LIMIT}` };
  }
  const items = await store.list({ ...(params.state ? { state: params.state as ReviewState } : {}), limit });
  return { kind: "success", correlationId, items };
}

/** What approving or rejecting does, in words — all effects are simulated, nothing leaves the system. */
export function describeEffect(item: ReviewItem, approved: boolean): string {
  if (item.summary?.type === "tool_call") {
    const target = item.summary.to ? ` to ${item.summary.to}` : "";
    return approved
      ? `Approved: the simulated ${item.summary.tool}${target} is released. Nothing is actually sent; the tools are simulated.`
      : `Rejected: the ${item.summary.tool}${target} stays blocked and never runs.`;
  }
  return approved
    ? "Approved: the content is released as a false positive."
    : "Rejected: the content stays blocked (treated as BLOCK).";
}

export type DecideOutcome =
  | { kind: "success"; correlationId: string; item: ReviewItem; effect: string }
  | { kind: "unauthenticated"; correlationId: string }
  | { kind: "forbidden"; correlationId: string }
  | { kind: "invalid"; correlationId: string; issues: string[] }
  | { kind: "not_found"; correlationId: string }
  | { kind: "conflict"; correlationId: string; reason: "already_decided" | "expired" };

export interface DecideDeps {
  store: ReviewStore;
  verify: (token: string | null) => Promise<ReviewerCheck>;
}

export async function decideReview(id: string, rawBody: unknown, token: string | null, deps: DecideDeps): Promise<DecideOutcome> {
  const correlationId = randomUUID();

  // Authenticate before anything else, so an anonymous caller learns nothing about which ids exist.
  const check = await deps.verify(token);
  if (check.kind !== "ok") return { kind: check.kind, correlationId };

  const parsed = decisionBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return { kind: "invalid", correlationId, issues: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`) };
  }

  const approved = parsed.data.decision === "approve";
  const result = await deps.store.decide(id, {
    decision: approved ? "APPROVED" : "REJECTED",
    reviewerId: check.reviewer.id,
    comment: parsed.data.comment ? parsed.data.comment : null,
  });

  if (!result.ok) {
    return result.reason === "not_found" ? { kind: "not_found", correlationId } : { kind: "conflict", correlationId, reason: result.reason };
  }
  return { kind: "success", correlationId, item: result.item, effect: describeEffect(result.item, approved) };
}
