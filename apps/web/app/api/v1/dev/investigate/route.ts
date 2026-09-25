import { NextResponse } from "next/server";
import { loadEnv } from "@hifz/config";
import { createModelGateway, investigate, type InvestigatorTools } from "@hifz/agents";
import type { Signal } from "@hifz/firewall-core";

/**
 * TEMPORARY dev-only route to exercise the investigator agent directly
 * while the real pipeline (normalize → detect → score → policy) and its
 * API route are still being built. Delete this once POST /api/v1/inspect
 * (docs/architecture/LLD.md §4) exists — it supersedes this route entirely.
 *
 * decode/rescan/getSessionHistory/getSourceProfile are stubbed here (real
 * detectors don't exist yet — see docs/PLAN.md 1.7/1.8/2.1) except decode,
 * which does a real best-effort base64 attempt so the tool-calling loop has
 * something genuine to exercise.
 */
const tools: InvestigatorTools = {
  decode: (text) => {
    try {
      const decoded = Buffer.from(text, "base64").toString("utf8");
      const looksLikeBase64 = /^[A-Za-z0-9+/=\s]+$/.test(text) && decoded.length > 0;
      return looksLikeBase64 ? { encoding: "base64", decoded } : { encoding: null, decoded: null };
    } catch {
      return { encoding: null, decoded: null };
    }
  },
  rescan: () => ({ signals: [] }),
  getSessionHistory: () => [],
  getSourceProfile: () => ({ trust: "untrusted", priorIncidentCount: 0 }),
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { content?: unknown; signals?: unknown } | null;
  if (!body || typeof body.content !== "string") {
    return NextResponse.json({ error: "body must be { content: string, signals?: Signal[] }" }, { status: 400 });
  }

  const env = loadEnv();
  const gateway = createModelGateway("investigator", env);

  if (gateway.metadata.provider === "none") {
    return NextResponse.json(
      { error: "INVESTIGATOR_PROVIDER is 'none' — set a real provider + model + key in .env.local to try this." },
      { status: 400 },
    );
  }

  const signals = (Array.isArray(body.signals) ? body.signals : []) as Signal[];

  const result = await investigate(gateway, {
    content: body.content,
    signals,
    tools,
    detectorVersion: "dev-route-1",
    timeoutMs: 30000,
  });

  return NextResponse.json({ ...result, provider: gateway.metadata.provider, model: gateway.metadata.model });
}
