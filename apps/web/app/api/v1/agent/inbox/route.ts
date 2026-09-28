import { NextResponse } from "next/server";
import { SEEDED_INBOX } from "@hifz/agents";

/**
 * GET /api/v1/agent/inbox — read-only view of the seeded demo inbox, for the
 * Agent demo screen's inbox panel (LLD §10). Not part of the §4 API table;
 * this exists purely so the browser doesn't need to import @hifz/agents
 * directly (its email fixtures use Buffer at module scope, Node-only).
 * Deliberately omits each email's `kind` — the UI shouldn't spoil which
 * ones are attacks before the agent runs.
 */
export function GET() {
  return NextResponse.json({
    emails: SEEDED_INBOX.map((seeded) => ({
      id: seeded.id,
      from: seeded.email.from,
      subject: seeded.email.subject,
      preview: (seeded.email.bodyText ?? seeded.email.bodyHtml ?? "").slice(0, 160),
    })),
  });
}
