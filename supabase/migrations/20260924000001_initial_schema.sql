-- Initial HIFZ schema. Mirrors docs/architecture/LLD.md §5 — keep the two in sync.
-- Applies to both the dev and demo Supabase projects (see docs/architecture/HLD.md §13).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type content_type as enum ('text', 'markdown', 'html', 'email', 'json', 'source_code', 'pdf', 'docx');
create type provenance_source as enum ('user_message', 'web_page', 'email', 'api_response', 'document', 'tool_output');
create type trust_level as enum ('trusted', 'semi_trusted', 'untrusted');
create type risk_band as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
create type policy_action as enum ('ALLOW', 'SANITIZE', 'REVIEW', 'BLOCK');
create type llm_status as enum ('not_called', 'ok', 'unavailable', 'invalid_output', 'cached');
create type attack_type as enum (
  'instruction_override',
  'role_change',
  'secret_extraction',
  'tool_abuse',
  'credential_theft',
  'context_poisoning',
  'multi_step_jailbreak',
  'encoded_instructions',
  'indirect_prompt_injection'
);
create type signal_severity as enum ('low', 'medium', 'high', 'critical');
create type evidence_layer as enum ('visible', 'hidden', 'decoded');
create type guard_outcome as enum ('EXECUTE', 'BLOCK', 'REQUIRE_APPROVAL');
create type review_kind as enum ('content', 'tool_call');
create type review_state as enum ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
create type eval_mode as enum ('rules_only', 'rules_llm');
create type eval_split as enum ('tuning', 'heldout');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_risk numeric not null default 0 check (session_risk >= 0 and session_risk <= 100),
  recent_attack_types attack_type[] not null default '{}',
  last_activity_at timestamptz not null default now()
);

create table inspections (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  session_id uuid references sessions (id) on delete set null,
  content_type content_type not null,
  source provenance_source not null,
  trust trust_level not null,
  origin text,
  content_hash text not null,
  content_excerpt text not null check (char_length(content_excerpt) <= 2048),
  score integer not null check (score >= 0 and score <= 100),
  rule_band risk_band not null,
  final_band risk_band not null,
  action policy_action not null,
  policy_rule_id text not null,
  reason text not null,
  llm_status llm_status not null default 'not_called',
  model_tag text,
  timings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table signals (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections (id) on delete cascade,
  detector_id text not null,
  attack_type attack_type not null,
  severity signal_severity not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  layer evidence_layer not null,
  evidence jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table llm_verdicts (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections (id) on delete cascade,
  model_tag text not null,
  verdict jsonb not null,
  steps jsonb not null default '[]',
  latency_ms integer not null,
  status llm_status not null,
  created_at timestamptz not null default now()
);

create table tool_calls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions (id) on delete set null,
  tool text not null,
  args_redacted jsonb not null default '{}',
  triggering_inspection_ids uuid[] not null default '{}',
  outcome guard_outcome not null,
  checks jsonb not null default '[]',
  review_id uuid,
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  kind review_kind not null,
  ref_id uuid not null,
  state review_state not null default 'PENDING',
  reviewer_id uuid references auth.users (id) on delete set null,
  comment text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

alter table tool_calls
  add constraint tool_calls_review_id_fkey foreign key (review_id) references reviews (id) on delete set null;

create table llm_cache (
  cache_key text primary key,
  verdict jsonb not null,
  model_tag text not null,
  created_at timestamptz not null default now()
);

create table eval_runs (
  id uuid primary key default gen_random_uuid(),
  git_sha text not null,
  mode eval_mode not null,
  split eval_split not null,
  model_tag text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'
);

create table eval_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references eval_runs (id) on delete cascade,
  case_id text not null,
  category text not null,
  expected_action policy_action not null,
  actual_action policy_action not null,
  expected_band risk_band not null,
  actual_band risk_band not null,
  latency_ms integer not null,
  correct boolean not null
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index inspections_created_at_idx on inspections (created_at desc);
create index inspections_final_band_action_idx on inspections (final_band, action);
create index signals_attack_type_idx on signals (attack_type);
create index reviews_state_idx on reviews (state);
create index eval_results_run_id_category_idx on eval_results (run_id, category);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Every table has RLS on. Server routes use the service-role key, which
-- bypasses RLS entirely — that's the only way anything gets written.
-- The policies below only grant read access where the app needs the browser
-- to query Supabase directly (dashboard, playground, evidence views).
-- No table grants INSERT/UPDATE/DELETE to anon/authenticated.

alter table sessions enable row level security;
alter table inspections enable row level security;
alter table signals enable row level security;
alter table llm_verdicts enable row level security;
alter table tool_calls enable row level security;
alter table reviews enable row level security;
alter table llm_cache enable row level security;
alter table eval_runs enable row level security;
alter table eval_results enable row level security;

-- Public read: demo data only, needed for the dashboard, playground, and evidence views.
create policy inspections_public_read on inspections for select using (true);
create policy signals_public_read on signals for select using (true);
create policy tool_calls_public_read on tool_calls for select using (true);
create policy eval_runs_public_read on eval_runs for select using (true);
create policy eval_results_public_read on eval_results for select using (true);

-- Reviewer-only: reviews are visible and updatable only to a signed-in reviewer.
-- The API route additionally checks the reviewer role server-side before
-- accepting a decision — this policy just stops an unauthenticated client
-- from reading or tampering with the queue directly.
create policy reviews_reviewer_read on reviews for select using (auth.role() = 'authenticated');
create policy reviews_reviewer_update on reviews for update using (auth.role() = 'authenticated');

-- sessions, llm_verdicts, and llm_cache carry no public-facing value and stay
-- server-only (no select policy = no access for anon/authenticated).

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
-- Inspections (and their cascaded signals/verdicts) older than 30 days are
-- deleted to stay inside the free-tier 500 MB limit. This function is called
-- by a scheduled Supabase cron job — see supabase/migrations/20260924000002_retention_cron.sql.
create function delete_expired_inspections() returns void as $$
begin
  delete from inspections where created_at < now() - interval '30 days';
end;
$$ language plpgsql security definer;
