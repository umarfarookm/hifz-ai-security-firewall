import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_IDS_KEY, InMemoryAuditWriter, SupabaseAuditWriter, partitionTriggeringIds } from "./audit.js";

describe("InMemoryAuditWriter.countRecentToolCalls", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("only counts calls within the window, for the right session and tool names", async () => {
    const audit = new InMemoryAuditWriter();
    const sessionId = randomUUID();
    const otherSessionId = randomUUID();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await audit.writeToolCall({ sessionId, tool: "send_email", argsRedacted: {}, triggeringInspectionIds: [], triggeringContentIds: [], outcome: "EXECUTE", checks: [] });

    // 6 minutes later — outside a 5-minute window.
    vi.setSystemTime(new Date("2026-01-01T00:06:00Z"));
    await audit.writeToolCall({ sessionId, tool: "send_email", argsRedacted: {}, triggeringInspectionIds: [], triggeringContentIds: [], outcome: "EXECUTE", checks: [] });
    // Different session — should never count.
    await audit.writeToolCall({
      sessionId: otherSessionId,
      tool: "send_email",
      argsRedacted: {},
      triggeringInspectionIds: [],
      triggeringContentIds: [],
      outcome: "EXECUTE",
      checks: [],
    });
    // Low-risk tool, not in the queried tool list — should never count.
    await audit.writeToolCall({ sessionId, tool: "read_inbox", argsRedacted: {}, triggeringInspectionIds: [], triggeringContentIds: [], outcome: "EXECUTE", checks: [] });

    const count = await audit.countRecentToolCalls(sessionId, ["send_email", "read_secrets"], 5);
    // Only the second send_email (just written, within the window) counts — the first is now 6 min old.
    expect(count).toBe(1);
  });
});

/** Captures the row a SupabaseAuditWriter inserts into tool_calls, and enforces what Postgres would. */
function toolCallsClient() {
  const inserted: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          const ids = row.triggering_inspection_ids as string[];
          const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const bad = ids.find((id) => !uuid.test(id));
          inserted.push({ table, ...row });
          return {
            select: () => ({
              single: async () =>
                bad === undefined
                  ? { data: { id: "row-1" }, error: null }
                  : { data: null, error: { message: `invalid input syntax for type uuid: "${bad}"` } },
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, inserted };
}

const baseRecord = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  tool: "read_secrets",
  argsRedacted: { name: "db_password" },
  outcome: "REQUIRE_APPROVAL" as const,
  checks: [],
};

describe("tool_calls triggering ids (uuid[] column)", () => {
  it("partitions non-UUID ids out of the uuid list and de-duplicates content ids", () => {
    const real = randomUUID();
    expect(partitionTriggeringIds([real, "inbox-001"], ["inbox-001", "inbox-002"])).toEqual({
      uuids: [real],
      contentIds: ["inbox-001", "inbox-002"],
    });
  });

  it("SupabaseAuditWriter stores seeded-inbox ids in args_redacted, not in the uuid[] column (regression: production /agent/run 500)", async () => {
    const { client, inserted } = toolCallsClient();
    await new SupabaseAuditWriter(client).writeToolCall({ ...baseRecord, triggeringInspectionIds: [], triggeringContentIds: ["inbox-001", "inbox-004"] });

    expect(inserted[0]!.triggering_inspection_ids).toEqual([]);
    expect(inserted[0]!.args_redacted).toEqual({ name: "db_password", [CONTENT_IDS_KEY]: ["inbox-001", "inbox-004"] });
  });

  it("SupabaseAuditWriter keeps real inspection UUIDs in the uuid[] column", async () => {
    const { client, inserted } = toolCallsClient();
    const real = randomUUID();
    await new SupabaseAuditWriter(client).writeToolCall({ ...baseRecord, triggeringInspectionIds: [real], triggeringContentIds: [] });

    expect(inserted[0]!.triggering_inspection_ids).toEqual([real]);
    expect(inserted[0]!.args_redacted).toEqual({ name: "db_password" }); // no reserved key when there are no content ids
  });

  it("SupabaseAuditWriter never sends a non-UUID to the uuid[] column, even if a caller passes one as an inspection id", async () => {
    const { client, inserted } = toolCallsClient();
    await expect(
      new SupabaseAuditWriter(client).writeToolCall({ ...baseRecord, triggeringInspectionIds: ["inbox-009"], triggeringContentIds: [] }),
    ).resolves.toBeTypeOf("string");

    expect(inserted[0]!.triggering_inspection_ids).toEqual([]);
    expect(inserted[0]!.args_redacted).toMatchObject({ [CONTENT_IDS_KEY]: ["inbox-009"] });
  });

  it("InMemoryAuditWriter now rejects a non-UUID inspection id, like Postgres does", async () => {
    await expect(new InMemoryAuditWriter().writeToolCall({ ...baseRecord, triggeringInspectionIds: ["inbox-001"], triggeringContentIds: [] })).rejects.toThrow(
      /invalid input syntax for type uuid/,
    );
  });
});
