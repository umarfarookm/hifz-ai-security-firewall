import { NextResponse } from "next/server";

/**
 * GET /api/v1/health — see docs/architecture/LLD.md §4.
 * Reports app status only for now; DB and LLM provider checks are added
 * once Supabase and the model gateway are wired up (Week 1).
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "up",
    db: "not_wired",
    llm: "not_wired",
    timestamp: new Date().toISOString(),
  });
}
