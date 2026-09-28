import type { SupabaseClient } from "@supabase/supabase-js";
import type { CachedVerdict, VerdictCache } from "@hifz/agents";

/**
 * Backs the investigator's verdict cache (LLD.md §3.6) with Supabase's
 * `llm_cache` table. Was defined in packages/agents/src/investigator/cache.ts
 * from the start, but nothing ever implemented this — every escalation-band
 * inspection re-called the live LLM even for identical repeated content,
 * silently defeating the cache's stated purpose (protecting free-tier
 * quota, reproducible eval runs). `computeCacheKey` already includes
 * detectorVersion, so a rule change naturally invalidates old entries
 * without any extra expiry logic here.
 */
export class SupabaseVerdictCache implements VerdictCache {
  constructor(private readonly client: SupabaseClient) {}

  async get(key: string): Promise<CachedVerdict | undefined> {
    const { data, error } = await this.client.from("llm_cache").select("verdict, model_tag").eq("cache_key", key).maybeSingle();
    if (error) throw new Error(`verdict cache get failed: ${error.message}`);
    if (!data) return undefined;
    return { verdict: data.verdict as CachedVerdict["verdict"], modelTag: data.model_tag as string };
  }

  async set(key: string, value: CachedVerdict): Promise<void> {
    const { error } = await this.client
      .from("llm_cache")
      .upsert({ cache_key: key, verdict: value.verdict, model_tag: value.modelTag }, { onConflict: "cache_key" });
    if (error) throw new Error(`verdict cache set failed: ${error.message}`);
  }
}
