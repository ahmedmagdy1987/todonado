-- ============================================================================
--  Todonado — quit_habits + quit_checkins (habits a user is BREAKING)
--
--  The wellness tracker records what you DO take. This records what you are
--  deliberately NOT doing, and how long you have kept it up.
--
--  DAY ZERO IS A TIMESTAMP, NOT A COUNTER. `quit_started_at` is the single
--  source of truth for the clean streak: the streak is DERIVED from it on every
--  render, exactly the way the Focus timer derives elapsed from `started_at`
--  instead of ticking a stored number. That means a slip is one UPDATE (move
--  day zero to now), the counter can never drift, and a user who does not open
--  the app for a week comes back to a streak that grew rather than one that
--  broke.
--
--  `longest_streak_days` is the ONLY denormalised value, and it only ever goes
--  UP: on a slip the client writes max(previous longest, days just completed),
--  so the record of the best run survives every reset. Losing that number would
--  make a slip feel like it erased the effort, which is precisely the opposite
--  of what this feature is for.
--
--  `quit_checkins` is an OPTIONAL affirmation ("still clean today"), not the
--  streak's source. It is deliberately NOT required for the clean streak —
--  forgetting to open the app is not a relapse, and a design that punished it
--  would be dishonest. UNIQUE (habit_id, checked_on) makes a second check-in on
--  the same local day a no-op rather than a duplicate row.
--
--  NOT TREATMENT. This is a personal tracker. There is no medical logic here,
--  no clinical scale, no intervention, no advice — `name`, `replacement_action`
--  and `notes` are free text and are never interpreted by the app.
--
--  OWNER-ONLY, mirroring wellness_items / wellness_logs exactly: every row is
--  private to its owner (user_id = auth.uid()), enforced on every action. No
--  cross-user access of any kind, and no anon access at all. Sensitive by
--  nature (a preset may name a health or sexual-behaviour category), so there
--  is no sharing surface, no aggregate read, and no service-role reader.
--  Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.quit_habits (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  name                text not null,
  -- One of the client's neutral preset keys, or 'custom'. Kept as text (not an
  -- enum) so adding a preset never needs a migration; the CHECK below is the
  -- backstop and the client allow-list is the real vocabulary.
  preset_key          text not null default 'custom',
  -- Day zero. Defaults to now() so "I'm starting today" needs no client clock.
  quit_started_at     timestamptz not null default now(),
  -- Best run ever completed, in whole local days. Monotonic: only ever raised.
  longest_streak_days integer not null default 0,
  -- The "do this instead" action, free text. Never interpreted server-side.
  replacement_action  text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists quit_habits_user_id_idx on public.quit_habits (user_id);

create table if not exists public.quit_checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  habit_id   uuid not null references public.quit_habits (id) on delete cascade,
  -- The LOCAL calendar day the user affirmed, computed client-side. A date (not
  -- a timestamptz) because "which day" is the whole meaning of the row.
  checked_on date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, checked_on)
);

create index if not exists quit_checkins_user_id_idx on public.quit_checkins (user_id);
create index if not exists quit_checkins_habit_id_idx on public.quit_checkins (habit_id);

-- ---- size + shape guards (added separately so re-running is safe) ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quit_habits_name_len') then
    alter table public.quit_habits
      add constraint quit_habits_name_len
      check (char_length(btrim(name)) between 1 and 60);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'quit_habits_preset_key_len') then
    alter table public.quit_habits
      add constraint quit_habits_preset_key_len
      check (char_length(btrim(preset_key)) between 1 and 40);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'quit_habits_replacement_len') then
    alter table public.quit_habits
      add constraint quit_habits_replacement_len
      check (replacement_action is null or char_length(replacement_action) <= 140);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'quit_habits_notes_len') then
    alter table public.quit_habits
      add constraint quit_habits_notes_len
      check (notes is null or char_length(notes) <= 500);
  end if;

  -- A best run cannot be negative, and cannot be centuries long either — this
  -- catches a client bug writing a garbage number, not a real user.
  if not exists (select 1 from pg_constraint where conname = 'quit_habits_longest_sane') then
    alter table public.quit_habits
      add constraint quit_habits_longest_sane
      check (longest_streak_days between 0 and 36500);
  end if;
end $$;

-- updated_at trigger (reuses the shared function from the initial schema).
drop trigger if exists set_updated_at on public.quit_habits;
create trigger set_updated_at before update on public.quit_habits
  for each row execute function public.set_updated_at();

alter table public.quit_habits enable row level security;
alter table public.quit_checkins enable row level security;

-- ---- RLS: owner-only, full CRUD (identical shape to wellness_items) --------
drop policy if exists quit_habits_select_own on public.quit_habits;
create policy quit_habits_select_own on public.quit_habits
  for select using (user_id = auth.uid());

drop policy if exists quit_habits_insert_own on public.quit_habits;
create policy quit_habits_insert_own on public.quit_habits
  for insert with check (user_id = auth.uid());

drop policy if exists quit_habits_update_own on public.quit_habits;
create policy quit_habits_update_own on public.quit_habits
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists quit_habits_delete_own on public.quit_habits;
create policy quit_habits_delete_own on public.quit_habits
  for delete using (user_id = auth.uid());

-- ---- RLS: check-ins are an append-only log (shape of wellness_logs) --------
--  Select / insert / delete but deliberately NO update: a check-in is a fact
--  about a day that already happened. Undoing one means deleting it.
drop policy if exists quit_checkins_select_own on public.quit_checkins;
create policy quit_checkins_select_own on public.quit_checkins
  for select using (user_id = auth.uid());

drop policy if exists quit_checkins_insert_own on public.quit_checkins;
create policy quit_checkins_insert_own on public.quit_checkins
  for insert with check (user_id = auth.uid());

drop policy if exists quit_checkins_delete_own on public.quit_checkins;
create policy quit_checkins_delete_own on public.quit_checkins
  for delete using (user_id = auth.uid());
