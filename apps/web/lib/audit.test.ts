import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryAuditWriter } from "./audit.js";

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
    await audit.writeToolCall({ sessionId, tool: "send_email", argsRedacted: {}, triggeringInspectionIds: [], outcome: "EXECUTE", checks: [] });

    // 6 minutes later — outside a 5-minute window.
    vi.setSystemTime(new Date("2026-01-01T00:06:00Z"));
    await audit.writeToolCall({ sessionId, tool: "send_email", argsRedacted: {}, triggeringInspectionIds: [], outcome: "EXECUTE", checks: [] });
    // Different session — should never count.
    await audit.writeToolCall({
      sessionId: otherSessionId,
      tool: "send_email",
      argsRedacted: {},
      triggeringInspectionIds: [],
      outcome: "EXECUTE",
      checks: [],
    });
    // Low-risk tool, not in the queried tool list — should never count.
    await audit.writeToolCall({ sessionId, tool: "read_inbox", argsRedacted: {}, triggeringInspectionIds: [], outcome: "EXECUTE", checks: [] });

    const count = await audit.countRecentToolCalls(sessionId, ["send_email", "read_secrets"], 5);
    // Only the second send_email (just written, within the window) counts — the first is now 6 min old.
    expect(count).toBe(1);
  });
});
