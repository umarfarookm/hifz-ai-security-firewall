import { NextResponse } from "next/server";
import { createModelGateway, type ModelGateway, type ModelRole } from "@hifz/agents";
import { loadEnv, type Env } from "@hifz/config";
import { createServerSupabaseClient } from "./supabase-server.js";
import { SupabaseAuditWriter, type AuditWriter } from "./audit.js";
import { checkRateLimit } from "./rate-limit.js";

let cachedEnv: Env | null = null;
export function getEnv(): Env {
  cachedEnv ??= loadEnv();
  return cachedEnv;
}

let cachedAudit: AuditWriter | null = null;
export function getAuditWriter(): AuditWriter {
  cachedAudit ??= new SupabaseAuditWriter(createServerSupabaseClient(getEnv()));
  return cachedAudit;
}

export function getGateway(role: ModelRole): ModelGateway {
  return createModelGateway(role, getEnv());
}

/** Best-effort client IP for the per-IP rate limiter — trusts Vercel's forwarding header. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function rateLimitOrNull(req: Request, limitPerMinute: number): NextResponse | null {
  const result = checkRateLimit(clientIp(req), limitPerMinute);
  if (result.allowed) return null;
  return NextResponse.json({ error: "rate limited, try again shortly" }, { status: 429 });
}

export async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
