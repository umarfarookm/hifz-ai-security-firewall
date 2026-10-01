import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { InMemoryAuditWriter } from "./audit.js";
import { InMemoryReviewStore, REVIEW_TTL_MS, SupabaseReviewStore, effectiveState } from "./review-store.js";

function toolCallRecord(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "11111111-1111-4111-8111-111111111111",
    tool: "send_email",
    argsRedacted: { to: "boss@gmail.com", body: "x".repeat(300) },
    triggeringInspectionIds: [],
    triggeringContentIds: ["inbox-001"],
    outcome: "REQUIRE_APPROVAL" as const,
    checks: [
      { checkId: "G1", passed: true, detail: "tool is on the allowlist" },
      { checkId: "G3", passed: false, detail: 'destination "boss@gmail.com" is not on the allowlist' },
    ],
    ...overrides,
  };
}

describe("effectiveState", () => {
  it("reads a PENDING item past its expiry as EXPIRED, and leaves decided states alone", () => {
    const past = new Date(1_000).toISOString();
    expect(effectiveState("PENDING", past, 2_000)).toBe("EXPIRED");
    expect(effectiveState("PENDING", past, 500)).toBe("PENDING");
    expect(effectiveState("APPROVED", past, 2_000)).toBe("APPROVED");
    expect(effectiveState("REJECTED", past, 2_000)).toBe("REJECTED");
  });
});

describe("InMemoryReviewStore", () => {
  async function setup() {
    let now = 1_000_000;
    const audit = new InMemoryAuditWriter();
    const toolCallId = await audit.writeToolCall(toolCallRecord());
    const store = new InMemoryReviewStore(audit, () => now);
    const reviewId = await store.createForToolCall(toolCallId);
    return { store, reviewId, audit, advance: (ms: number) => (now += ms) };
  }

  it("summarises a tool-call review: destination, a trimmed body, the failing check and the triggering emails", async () => {
    const { store, reviewId } = await setup();
    const item = (await store.get(reviewId))!;
    expect(item.state).toBe("PENDING");
    expect(item.summary).toMatchObject({
      type: "tool_call",
      tool: "send_email",
      to: "boss@gmail.com",
      failedCheck: { checkId: "G3" },
      triggeredBy: ["inbox-001"],
    });
    expect((item.summary as { preview: string }).preview.length).toBeLessThanOrEqual(241); // 240 chars + ellipsis
  });

  it("lets a pending item be approved once, and refuses a second decision", async () => {
    const { store, reviewId } = await setup();
    const first = await store.decide(reviewId, { decision: "APPROVED", reviewerId: "r-1", comment: "ok" });
    expect(first.ok && first.item).toMatchObject({ state: "APPROVED", comment: "ok" });
    expect(first.ok && first.item.decidedAt).toBeTruthy();

    const second = await store.decide(reviewId, { decision: "REJECTED", reviewerId: "r-2", comment: null });
    expect(second).toEqual({ ok: false, reason: "already_decided" });
    expect((await store.get(reviewId))!.state).toBe("APPROVED"); // the first decision stands
  });

  it("expires after 15 minutes: reads as EXPIRED and refuses a late decision (fail-safe, treated as rejected)", async () => {
    const { store, reviewId, advance } = await setup();
    advance(REVIEW_TTL_MS - 1);
    expect((await store.get(reviewId))!.state).toBe("PENDING");

    advance(2);
    expect((await store.get(reviewId))!.state).toBe("EXPIRED");
    expect(await store.decide(reviewId, { decision: "APPROVED", reviewerId: "r-1", comment: null })).toEqual({ ok: false, reason: "expired" });
  });

  it("reports an unknown id as not_found", async () => {
    const { store } = await setup();
    expect(await store.decide("00000000-0000-4000-8000-000000000000", { decision: "APPROVED", reviewerId: "r", comment: null })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("lists newest first and filters on the effective state", async () => {
    const { store, reviewId, advance, audit } = await setup();
    advance(10);
    const second = await store.createForToolCall(await audit.writeToolCall(toolCallRecord()));
    await store.decide(reviewId, { decision: "REJECTED", reviewerId: "r", comment: null });

    expect((await store.list({ limit: 10 })).map((i) => i.id)).toEqual([second, reviewId]);
    expect((await store.list({ state: "PENDING", limit: 10 })).map((i) => i.id)).toEqual([second]);
    expect((await store.list({ state: "REJECTED", limit: 10 })).map((i) => i.id)).toEqual([reviewId]);

    advance(REVIEW_TTL_MS);
    expect((await store.list({ state: "EXPIRED", limit: 10 })).map((i) => i.id)).toEqual([second]);
  });
});

/** Scripted stand-in for the Supabase query builder: records filters and replays canned results per table and verb. */
function fakeClient(script: { updateResult?: unknown; selectRows?: unknown[] }) {
  const calls: Array<{ table: string; verb: string; filters: Array<[string, unknown]>; payload?: unknown }> = [];
  const client = {
    from(table: string) {
      const call: (typeof calls)[number] = { table, verb: "select", filters: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {
        update(payload: unknown) {
          call.verb = "update";
          call.payload = payload;
          return builder;
        },
        select: () => builder,
        eq(col: string, val: unknown) {
          call.filters.push([`eq:${col}`, val]);
          return builder;
        },
        gt(col: string, val: unknown) {
          call.filters.push([`gt:${col}`, val]);
          return builder;
        },
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: call.verb === "update" ? (script.updateResult ?? null) : (script.selectRows?.[0] ?? null), error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: script.selectRows ?? [], error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("SupabaseReviewStore.decide", () => {
  const NOW = Date.parse("2026-10-01T12:00:00Z");
  const row = (state: string, expiresAt: string) => ({
    id: "r1",
    kind: "tool_call",
    ref_id: "t1",
    state,
    comment: null,
    created_at: "2026-10-01T11:50:00Z",
    decided_at: null,
    expires_at: expiresAt,
  });

  it("decides with ONE conditional update: only a PENDING, unexpired row matches (atomic against races and late clicks)", async () => {
    const { client, calls } = fakeClient({ updateResult: row("APPROVED", "2026-10-01T12:05:00Z") });
    const result = await new SupabaseReviewStore(client, () => NOW).decide("r1", { decision: "APPROVED", reviewerId: "u1", comment: "ok" });

    expect(result.ok).toBe(true);
    const update = calls.find((c) => c.verb === "update")!;
    expect(update.filters).toEqual([
      ["eq:id", "r1"],
      ["eq:state", "PENDING"],
      ["gt:expires_at", new Date(NOW).toISOString()],
    ]);
    expect(update.payload).toMatchObject({ state: "APPROVED", reviewer_id: "u1", comment: "ok" });
  });

  it("explains a failed update: not found, already decided, or expired", async () => {
    const decide = (existing: ReturnType<typeof row> | null) =>
      new SupabaseReviewStore(fakeClient({ updateResult: null, selectRows: existing ? [existing] : [] }).client, () => NOW).decide("r1", {
        decision: "APPROVED",
        reviewerId: "u1",
        comment: null,
      });

    expect(await decide(null)).toEqual({ ok: false, reason: "not_found" });
    expect(await decide(row("REJECTED", "2026-10-01T12:05:00Z"))).toEqual({ ok: false, reason: "already_decided" });
    expect(await decide(row("PENDING", "2026-10-01T11:55:00Z"))).toEqual({ ok: false, reason: "expired" });
  });
});
