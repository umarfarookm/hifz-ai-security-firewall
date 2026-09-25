import { createHash } from "node:crypto";
import type { LlmVerdict } from "./verdict-schema.js";

export interface CachedVerdict {
  verdict: LlmVerdict;
  modelTag: string;
}

/**
 * Verdict cache, keyed by content + detector version + model. Protects
 * free-tier LLM quota and makes eval runs reproducible (docs/architecture/
 * LLD.md §3.6). The real store is Supabase's `llm_cache` table, wired in at
 * the API route layer — this package only depends on the interface, so it
 * stays testable without a database.
 */
export interface VerdictCache {
  get(key: string): Promise<CachedVerdict | undefined> | CachedVerdict | undefined;
  set(key: string, value: CachedVerdict): Promise<void> | void;
}

export function computeCacheKey(normalizedContent: string, detectorVersion: string, modelTag: string): string {
  return createHash("sha256").update(normalizedContent).update("\u0000").update(detectorVersion).update("\u0000").update(modelTag).digest("hex");
}

/** In-memory cache for local dev, tests, and the eval CLI. Not shared across serverless invocations. */
export class InMemoryVerdictCache implements VerdictCache {
  private readonly store = new Map<string, CachedVerdict>();

  get(key: string): CachedVerdict | undefined {
    return this.store.get(key);
  }

  set(key: string, value: CachedVerdict): void {
    this.store.set(key, value);
  }
}
