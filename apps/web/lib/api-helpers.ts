import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { ModelGateway, ModelRole, VerdictCache } from "@hifz/agents";
import { loadEnv, type Env } from "@hifz/config";
import { createServerSupabaseClient } from "./supabase-server.js";
import { resolveGateway } from "./gateway.js";
import { SupabaseAuditWriter, type AuditWriter } from "./audit.js";
import { checkRateLimit } from "./rate-limit.js";
import { SupabaseVerdictCache } from "./verdict-cache.js";

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

/** Never throws on a config error — see resolveGateway. A misconfigured role gets the "none" (rules-only) gateway. */
export function getGateway(role: ModelRole): ModelGateway {
  return resolveGateway(role, getEnv()).gateway;
}

let cachedVerdictCache: SupabaseVerdictCache | null = null;
/** null when LLM_CACHE_ENABLED is false — callers should treat that as "no cache", not retry. */
export function getVerdictCache(): VerdictCache | null {
  if (!getEnv().LLM_CACHE_ENABLED) return null;
  cachedVerdictCache ??= new SupabaseVerdictCache(createServerSupabaseClient(getEnv()));
  return cachedVerdictCache;
}

/** Best-effort client IP for the per-IP rate limiter — trusts Vercel's forwarding header. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * `route` namespaces the rate-limit bucket (e.g. "inspect", "agent-run") so
 * each route's own limit (LLD.md §4/§9: 10/min for /inspect, 3/min for
 * /agent/run) is tracked independently per IP — without it, calls to one
 * route would count against another route's separate cap for the same IP.
 */
export function rateLimitOrNull(req: Request, route: string, limitPerMinute: number): NextResponse | null {
  const result = checkRateLimit(`${route}:${clientIp(req)}`, limitPerMinute);
  if (result.allowed) return null;
  return NextResponse.json({ error: "rate limited, try again shortly", correlationId: randomUUID() }, { status: 429 });
}

export async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
