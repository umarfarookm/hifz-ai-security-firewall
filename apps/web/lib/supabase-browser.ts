import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Browser-side Supabase client, used only for reviewer sign-in. It carries the public anon key, which is safe
 * to ship by design: Row Level Security keeps the tables closed to it, and every read and write of review data
 * goes through the /api/v1 routes using the server-only key.
 */
export function getBrowserSupabase(): SupabaseClient {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
  return client;
}
