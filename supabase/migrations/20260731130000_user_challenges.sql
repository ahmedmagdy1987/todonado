-- ============================================================================
--  Todonado — user_challenges (a structured push, opted into)
--
--  THIS TABLE RECORDS THAT YOU JOINED. IT NEVER RECORDS YOUR PROGRESS.
--
--  That is the whole design, and it is the same discipline as the planning
--  streak and the points score: progress is DERIVED on render from rows the app
--  already has (tasks, focus_sessions, quit_checkins, journal_entries), never
--  counted into a column. A stored counter would need a daily job to stay
--  current, would drift the moment a task was corrected or un-completed, and
--  would have to be repaired by hand when it did. Derived progress cannot drift,
--  because there is nothing to drift FROM — undo a task and the challenge bar
--  moves back on the next render, which is the truth.
--
--  So there is no `progress` column here, and there must never be one. The four
--  columns that matter are: which challenge, when it started, whether it
--  finished, and when.
--
--  `started_at` IS A DATE, NOT A TIMESTAMP, and it is part of the uniqueness
--  rule. Every metric this feature computes is counted in whole LOCAL CALENDAR
--  DAYS ("7 days straight", "50 tasks this month"), so a timestamp would invite
--  comparisons at the wrong precision — and two challenges started nine hours
--  apart on the same day are the same attempt, not two. UNIQUE (user_id,
--  challenge_key, started_at) therefore makes a double-tap a no-op while leaving
--  a genuine restart tomorrow perfectly legal.
--
--  NO CHECK ON `challenge_key`. Unlike `feature_intents` — where the key set is a
--  contract with the analytics reader and a typo would silently pollute the data
--  — the catalog here is client-side content that will grow, and a CHECK would
--  mean a migration every time a challenge is added. An unknown key is handled
--  where it can be handled kindly: the client shows the row as an unrecognised
--  past attempt rather than crashing. `challengeKeys.test.ts` pins the catalog
--  against the client type instead.
--
--  OWNER-ONLY, mirroring vision_cards / mind_maps: every row is private to its
--  owner (user_id = auth.uid()), enforced on every action, with no anon access
--  of any kind. Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.user_challenges (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- Catalog id, e.g. 'plan_7'. Deliberately unconstrained — see the header.
  challenge_key text not null,
  -- Local calendar day the attempt began. Every metric counts whole days.
  started_at    date not null,
  -- Set once, when the derived progress first reaches the target.
  completed_at  timestamptz,
  -- 'active' | 'completed' | 'abandoned'. An attempt that simply runs out of
  -- time is NOT written to — it stays 'active' and the client shows it as ended,
  -- because marking someone "abandoned" for a quiet fortnight is a judgement the
  -- app has no business making. 'abandoned' is only ever written by the user
  -- explicitly leaving.
  status        text not null default 'active',
  created_at    timestamptz not null default now()
);

create index if not exists user_challenges_user_id_idx on public.user_challenges (user_id);

-- ---- size + shape guards (added separately so re-running is safe) ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_challenges_status_valid') then
    alter table public.user_challenges
      add constraint user_challenges_status_valid
      check (status in ('active', 'completed', 'abandoned'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_challenges_key_len') then
    alter table public.user_challenges
      add constraint user_challenges_key_len
      check (char_length(btrim(challenge_key)) between 1 and 40);
  end if;

  -- A completed row must say WHEN, and an incomplete one must not pretend.
  if not exists (select 1 from pg_constraint where conname = 'user_challenges_completed_shape') then
    alter table public.user_challenges
      add constraint user_challenges_completed_shape
      check (
        (status = 'completed' and completed_at is not null)
        or (status <> 'completed' and completed_at is null)
      );
  end if;

  -- One attempt per challenge per day. See the header: a double-tap is the same
  -- attempt; a restart tomorrow is a different one and stays legal.
  if not exists (select 1 from pg_constraint where conname = 'user_challenges_one_per_day') then
    alter table public.user_challenges
      add constraint user_challenges_one_per_day
      unique (user_id, challenge_key, started_at);
  end if;
end $$;

alter table public.user_challenges enable row level security;

-- ---- RLS: owner-only, full CRUD --------------------------------------------
drop policy if exists user_challenges_select_own on public.user_challenges;
create policy user_challenges_select_own on public.user_challenges
  for select using (user_id = auth.uid());

drop policy if exists user_challenges_insert_own on public.user_challenges;
create policy user_challenges_insert_own on public.user_challenges
  for insert with check (user_id = auth.uid());

drop policy if exists user_challenges_update_own on public.user_challenges;
create policy user_challenges_update_own on public.user_challenges
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_challenges_delete_own on public.user_challenges;
create policy user_challenges_delete_own on public.user_challenges
  for delete using (user_id = auth.uid());
