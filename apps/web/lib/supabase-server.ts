import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "@hifz/config";

/**
 * Server-only Supabase client, using the service-role key which bypasses
 * RLS — never import this from anything that could run in the browser.
 * See docs/architecture/HLD.md §10 (secret leakage to browser control).
 */
export function createServerSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
