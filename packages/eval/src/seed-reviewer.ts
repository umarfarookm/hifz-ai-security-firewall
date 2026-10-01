#!/usr/bin/env node
/**
 * Creates (or updates) the demo reviewer account — docs/architecture/LLD.md §4 ("reviewer accounts seeded").
 *
 * The reviewer role lives in Supabase Auth's `app_metadata`, which only the service key can write; a user cannot
 * set it on themselves, so public sign-up never produces a reviewer. POST /reviews/{id}/decision checks it
 * server-side.
 *
 * Usage (env from the shell, so the password never appears on a command line or in the transcript):
 *   set -a; . ./.env.demo.local; set +a
 *   pnpm --filter @hifz/eval run seed-reviewer            # create, or reset the password and role
 *   pnpm --filter @hifz/eval run seed-reviewer -- --delete  # remove the account
 *
 * Reads REVIEWER_EMAIL and REVIEWER_PASSWORD, plus NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Prints only the email and what it did.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Same pattern as cli.ts: values already set in the shell win, .env.local only fills gaps.
config({ path: "../../.env.local" });

const MIN_PASSWORD_LENGTH = 12;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[seed-reviewer] ${name} is not set.`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const email = required("REVIEWER_EMAIL").trim().toLowerCase();
  const del = process.argv.includes("--delete");
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // listUsers is paginated; a demo project has a handful of users, so a few pages is plenty.
  let existingId: string | null = null;
  for (let page = 1; page <= 10 && !existingId; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`could not list users: ${error.message}`);
    existingId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (data.users.length < 100) break;
  }

  if (del) {
    if (!existingId) return console.log(`[seed-reviewer] ${email} does not exist, nothing to delete.`);
    const { error } = await client.auth.admin.deleteUser(existingId);
    if (error) throw new Error(`delete failed: ${error.message}`);
    return console.log(`[seed-reviewer] deleted ${email}.`);
  }

  const password = required("REVIEWER_PASSWORD");
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`[seed-reviewer] REVIEWER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const attributes = { password, email_confirm: true, app_metadata: { role: "reviewer" } };
  const { error } = existingId ? await client.auth.admin.updateUserById(existingId, attributes) : await client.auth.admin.createUser({ email, ...attributes });
  if (error) throw new Error(`${existingId ? "update" : "create"} failed: ${error.message}`);
  console.log(`[seed-reviewer] ${existingId ? "updated" : "created"} reviewer ${email} on ${new URL(url).host}.`);
}

main().catch((err) => {
  console.error(`[seed-reviewer] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
