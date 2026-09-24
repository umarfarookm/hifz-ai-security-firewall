import { NextResponse } from "next/server";
import { ingestAdapters, type ContentType } from "@hifz/firewall-core";

/**
 * TEMPORARY dev-only route to exercise the ingest adapters directly while
 * the real pipeline (normalize → detect → score → policy) is still being
 * built. Delete this once POST /api/v1/inspect (docs/architecture/LLD.md
 * §4) exists — it supersedes this route entirely.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { content?: unknown; contentType?: unknown } | null;
  if (!body || typeof body.content !== "string" || typeof body.contentType !== "string") {
    return NextResponse.json({ error: "body must be { content: string, contentType: string }" }, { status: 400 });
  }

  const content: string = body.content;
  const contentType: string = body.contentType;

  const adapter = ingestAdapters[contentType as ContentType];
  if (!adapter) {
    return NextResponse.json(
      { error: `no ingest adapter for contentType "${contentType}"`, supported: Object.keys(ingestAdapters) },
      { status: 400 },
    );
  }

  const result = adapter(content);
  return NextResponse.json(result);
}
