import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "@hifz/config";

/**
 * Server-only Supabase client using the service-role key. Duplicated from
 * apps/web/lib/supabase-server.ts rather than imported — no package may
 * import apps/web (see eslint.config.js), and this function has no
 * Next.js-specific logic, so duplicating the ~4 lines here is simpler than
 * relocating it to a shared package for one caller. See also
 * packages/firewall-core/src/band.ts, which documents the same tradeoff
 * for a different small duplicated helper.
 */
export function createServerSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
