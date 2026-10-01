import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { InMemoryAuditWriter } from "./audit.js";
import { InMemoryReviewStore } from "./review-store.js";
import { bearerToken, decideReview, describeEffect, listReviews, verifyReviewer, type ReviewerCheck } from "./reviews.js";

async function setup() {
  const audit = new InMemoryAuditWriter();
  const store = new InMemoryReviewStore(audit);
  const toolCallId = await audit.writeToolCall({
    sessionId: "11111111-1111-4111-8111-111111111111",
    tool: "send_email",
    argsRedacted: { to: "boss@gmail.com", body: "Summary" },
    triggeringInspectionIds: [],
    triggeringContentIds: [],
    outcome: "REQUIRE_APPROVAL",
    checks: [{ checkId: "G3", passed: false, detail: "not on the allowlist" }],
  });
  const reviewId = await store.createForToolCall(toolCallId);
  return { store, reviewId };
}

const asReviewer = async (): Promise<ReviewerCheck> => ({ kind: "ok", reviewer: { id: "reviewer-1" } });

describe("verifyReviewer", () => {
  const authClient = (user: { id: string; app_metadata?: Record<string, unknown> } | null, error = false) =>
    ({ auth: { getUser: async () => (user && !error ? { data: { user }, error: null } : { data: { user: null }, error: { message: "bad token" } }) } }) as unknown as SupabaseClient;

  it("accepts only a valid token whose server-controlled app_metadata role is reviewer", async () => {
    expect(await verifyReviewer(authClient({ id: "u1", app_metadata: { role: "reviewer" } }), "tok")).toEqual({ kind: "ok", reviewer: { id: "u1" } });
  });

  it("answers 403 (forbidden) for a valid account that is not a reviewer — including a self-signed-up user", async () => {
    expect(await verifyReviewer(authClient({ id: "u2", app_metadata: {} }), "tok")).toEqual({ kind: "forbidden" });
    expect(await verifyReviewer(authClient({ id: "u3", app_metadata: { role: "admin" } }), "tok")).toEqual({ kind: "forbidden" });
  });

  it("answers 401 (unauthenticated) for a missing or invalid token, without calling the auth service for a missing one", async () => {
    expect(await verifyReviewer(authClient(null), null)).toEqual({ kind: "unauthenticated" });
    expect(await verifyReviewer(authClient({ id: "u1", app_metadata: { role: "reviewer" } }, true), "expired")).toEqual({ kind: "unauthenticated" });
  });
});

describe("bearerToken", () => {
  it("extracts the token and rejects anything that is not a Bearer header", () => {
    expect(bearerToken("Bearer abc.def")).toBe("abc.def");
    expect(bearerToken("bearer   abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("Bearer ")).toBeNull();
  });
});

describe("decideReview", () => {
  it("approves a pending item for a reviewer and describes the (simulated) effect", async () => {
    const { store, reviewId } = await setup();
    const outcome = await decideReview(reviewId, { decision: "approve", comment: "looks fine" }, "tok", { store, verify: asReviewer });

    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") return;
    expect(outcome.item).toMatchObject({ state: "APPROVED", comment: "looks fine" });
    expect(outcome.effect).toContain("simulated send_email to boss@gmail.com");
    expect(outcome.effect).toContain("Nothing is actually sent");
  });

  it("rejects: the held action stays blocked", async () => {
    const { store, reviewId } = await setup();
    const outcome = await decideReview(reviewId, { decision: "reject" }, "tok", { store, verify: asReviewer });
    expect(outcome.kind === "success" && outcome.item.state).toBe("REJECTED");
    expect(outcome.kind === "success" && outcome.effect).toContain("stays blocked");
  });

  it("authenticates before anything else: an anonymous or non-reviewer caller learns nothing about whether the id exists", async () => {
    const { store, reviewId } = await setup();
    const anonymous = (): Promise<ReviewerCheck> => Promise.resolve({ kind: "unauthenticated" });
    const notReviewer = (): Promise<ReviewerCheck> => Promise.resolve({ kind: "forbidden" });

    expect((await decideReview(reviewId, { decision: "approve" }, null, { store, verify: anonymous })).kind).toBe("unauthenticated");
    expect((await decideReview(reviewId, { decision: "approve" }, "tok", { store, verify: notReviewer })).kind).toBe("forbidden");
    expect((await decideReview("no-such-id", { decision: "approve" }, null, { store, verify: anonymous })).kind).toBe("unauthenticated"); // not "not_found"
    expect((await store.get(reviewId))!.state).toBe("PENDING"); // nothing was decided
  });

  it("validates the body", async () => {
    const { store, reviewId } = await setup();
    for (const bad of [null, {}, { decision: "maybe" }, { decision: "approve", comment: "x".repeat(501) }]) {
      const outcome = await decideReview(reviewId, bad, "tok", { store, verify: asReviewer });
      expect(outcome.kind).toBe("invalid");
    }
    expect((await store.get(reviewId))!.state).toBe("PENDING");
  });

  it("returns not_found for an unknown id and a conflict for a repeat decision", async () => {
    const { store, reviewId } = await setup();
    expect((await decideReview("00000000-0000-4000-8000-000000000000", { decision: "approve" }, "tok", { store, verify: asReviewer })).kind).toBe("not_found");

    await decideReview(reviewId, { decision: "approve" }, "tok", { store, verify: asReviewer });
    const again = await decideReview(reviewId, { decision: "reject" }, "tok", { store, verify: asReviewer });
    expect(again).toMatchObject({ kind: "conflict", reason: "already_decided" });
  });
});

describe("listReviews", () => {
  it("lists items, and rejects an unknown state or an out-of-range limit", async () => {
    const { store } = await setup();
    const ok = await listReviews(store, { state: null, limit: null });
    expect(ok.kind === "success" && ok.items).toHaveLength(1);

    expect((await listReviews(store, { state: "BOGUS", limit: null })).kind).toBe("invalid");
    expect((await listReviews(store, { state: null, limit: "0" })).kind).toBe("invalid");
    expect((await listReviews(store, { state: null, limit: "101" })).kind).toBe("invalid");
    expect((await listReviews(store, { state: "PENDING", limit: "5" })).kind).toBe("success");
  });
});

describe("describeEffect", () => {
  it("never claims anything is really sent", async () => {
    const { store, reviewId } = await setup();
    const item = (await store.get(reviewId))!;
    expect(describeEffect(item, true)).toMatch(/simulated/i);
    expect(describeEffect(item, false)).not.toMatch(/sent/i);
  });
});
