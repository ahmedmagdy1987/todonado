-- ============================================================================
--  Todonado — first-party behavioral events (insert-only, no read-back)
--
--  Records the handful of behavioral events the effort-aware-planning wedge
--  depends on, so we can finally MEASURE whether the wedge functions (the
--  PROJECT_STATE.md "dominant risk" — zero validation). SIGNAL ONLY.
--
--  PRIVACY: no PII beyond user_id. We store the event name, an optional single
--  boolean `flag` (e.g. has_effort on task_created), and an optional short
--  `source` string (a UI location like 'today'/'inbox' — never task text/title).
--
--  RLS mirrors feature_intents / upgrade_intents EXACTLY: anyone (anon or
--  authenticated) may INSERT their own event; a signed-in user can only
--  attribute a row to themselves (user_id = auth.uid()) or leave it null. There
--  is intentionally NO select/update/delete policy, so the public client can
--  NEVER read the table back — counts are reviewed in the SQL editor / via
--  service_role (see docs/ANALYTICS_QUERIES.sql). The client inserts WITHOUT
--  .select().
-- ============================================================================

create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  event      text not null check (event in (
    'task_created', 'effort_entered', 'template_applied', 'capacity_viewed',
    'over_capacity_hit', 'task_completed', 'focus_completed', 'day_returned'
  )),
  -- A single boolean signal the wedge cares about (e.g. has_effort). Nullable.
  flag       boolean,
  -- Short, non-PII UI context, e.g. 'today' | 'inbox' | 'create'. Nullable.
  source     text,
  created_at timestamptz not null default now()
);

create index if not exists events_created_at_idx on public.events (created_at);
create index if not exists events_event_idx      on public.events (event);
create index if not exists events_user_id_idx    on public.events (user_id);

alter table public.events enable row level security;

-- Insert-only for the public API. anon can only file an anonymous event
-- (user_id must be null); an authenticated user may attribute it to themselves.
drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert
  to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
