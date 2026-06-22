-- ============================================================================
--  Todonado — feature_intents (fake-door demand capture for UNBUILT features)
--
--  Records a click on a "Notify me" button for a not-yet-built feature concept
--  (the "Focus & Calm" wellness angle), so we can measure interest BEFORE
--  building meditation / sleep sounds / a supplement tracker. SIGNAL ONLY — no
--  feature, no content, no entitlement, no audio, no tracking logic.
--
--  Sibling to upgrade_intents (willingness-to-pay) rather than a new column on
--  it: upgrade_intents.tier is NOT NULL CHECK ('pro','team'), and a feature
--  concept is a different axis from a paid tier — keeping them separate leaves
--  each table's meaning pure and avoids ALTERing a verified-live table.
--
--  RLS mirrors upgrade_intents exactly: anyone (anon or authenticated) may
--  INSERT their own intent; a signed-in user can only attribute a row to
--  themselves (user_id = auth.uid()) or leave it null. There is intentionally
--  NO select/update/delete policy, so the public API cannot read the table back
--  — counts are reviewed in the SQL editor / via service_role (the client
--  inserts WITHOUT .select()).
-- ============================================================================

create table if not exists public.feature_intents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  feature_key text not null check (feature_key in ('meditation', 'sleep_sounds', 'supplement_tracker')),
  source      text,
  created_at  timestamptz not null default now()
);

create index if not exists feature_intents_created_at_idx  on public.feature_intents (created_at);
create index if not exists feature_intents_feature_key_idx on public.feature_intents (feature_key);

alter table public.feature_intents enable row level security;

-- Insert-only for the public API. anon can only file an anonymous intent
-- (user_id must be null); an authenticated user may attribute it to themselves.
drop policy if exists feature_intents_insert on public.feature_intents;
create policy feature_intents_insert on public.feature_intents
  for insert
  to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
