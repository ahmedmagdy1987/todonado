-- ============================================================================
--  Todonado — upgrade_intents (fake-door willingness-to-pay capture)
--
--  Records a click on a paid-tier CTA (and an optional email) BEFORE any real
--  billing exists, so we can measure demand for Pro/Team before building Stripe.
--  This is SIGNAL ONLY — no plan, no entitlement, no subscription state.
--
--  RLS: anyone (anon or authenticated) may INSERT their own intent; a signed-in
--  user can only attribute a row to themselves (user_id = auth.uid()) or leave it
--  null. There is intentionally NO select/update/delete policy, so the public API
--  cannot read the table back — intents are reviewed via the dashboard /
--  service_role only (the client inserts without .select()).
-- ============================================================================

create table if not exists public.upgrade_intents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  email      text,
  tier       text not null check (tier in ('pro', 'team')),
  source     text,
  created_at timestamptz not null default now()
);

create index if not exists upgrade_intents_created_at_idx on public.upgrade_intents (created_at);
create index if not exists upgrade_intents_tier_idx       on public.upgrade_intents (tier);

alter table public.upgrade_intents enable row level security;

-- Insert-only for the public API. anon can only file an anonymous intent
-- (user_id must be null); an authenticated user may attribute it to themselves.
drop policy if exists upgrade_intents_insert on public.upgrade_intents;
create policy upgrade_intents_insert on public.upgrade_intents
  for insert
  to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
