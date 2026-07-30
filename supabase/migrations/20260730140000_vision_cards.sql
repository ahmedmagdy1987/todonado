-- ============================================================================
--  Todonado — vision_cards (the goals a user is actually working toward)
--
--  Tasks are what you do today. Projects are how work is grouped. Neither one
--  records WHY. A vision card is that: a goal, the reason behind it, an optional
--  target date, and — the part that makes it more than a mood board — an
--  optional link to the project that actually serves it.
--
--  TEXT-FIRST, DELIBERATELY. There are no image columns and no storage bucket
--  here. Images mean upload limits, a storage policy, moderation questions,
--  thumbnailing and a bill, and none of that is worth guessing at before anyone
--  has asked for it. The app measures that demand honestly instead, through a
--  feature_intents chip ('vision_images'), and this table stays small until the
--  answer is in.
--
--  `position` IS double precision, matching tasks/sections/subtasks, because the
--  app reorders by writing the MIDPOINT between two neighbours
--  (lib/reorder.ts positionBetween). That is one UPDATE of one row per drag, with
--  no reindex and no batch write — an integer column would force one of those.
--
--  THE PROJECT LINK IS GUARDED, not merely nullable. vision_cards is
--  user-scoped while projects are workspace-scoped, so owner-only RLS alone
--  would let a hostile client store a project_id it cannot read. The insert and
--  update policies therefore also require public.can_access_project(project_id),
--  the same SECURITY DEFINER helper every workspace-scoped table uses. A project
--  that is later deleted sets the link to null rather than deleting the goal —
--  losing someone's goal because a project went away would be indefensible.
--
--  OWNER-ONLY, mirroring wellness_items / quit_habits: every row is private to
--  its owner (user_id = auth.uid()), enforced on every action, with no anon
--  access of any kind. Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.vision_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  -- The reason. Free text, never interpreted by the app.
  why         text,
  -- Optional and deliberately soft: a goal without a date is still a goal, and
  -- a date that passes is not a failure, so nothing here ever "expires".
  target_date date,
  -- Fractional so a drag is one UPDATE. See the note above.
  position    double precision not null default 0,
  -- "This project serves this goal". Nullable; a deleted project unlinks.
  project_id  uuid references public.projects (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists vision_cards_user_id_idx on public.vision_cards (user_id);
create index if not exists vision_cards_project_id_idx on public.vision_cards (project_id);

-- ---- size + shape guards (added separately so re-running is safe) ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vision_cards_title_len') then
    alter table public.vision_cards
      add constraint vision_cards_title_len
      check (char_length(btrim(title)) between 1 and 80);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'vision_cards_why_len') then
    alter table public.vision_cards
      add constraint vision_cards_why_len
      check (why is null or char_length(why) <= 500);
  end if;
end $$;

-- updated_at trigger (reuses the shared function from the initial schema).
drop trigger if exists set_updated_at on public.vision_cards;
create trigger set_updated_at before update on public.vision_cards
  for each row execute function public.set_updated_at();

alter table public.vision_cards enable row level security;

-- ---- RLS: owner-only, full CRUD, plus the project-link guard ----------------
drop policy if exists vision_cards_select_own on public.vision_cards;
create policy vision_cards_select_own on public.vision_cards
  for select using (user_id = auth.uid());

drop policy if exists vision_cards_insert_own on public.vision_cards;
create policy vision_cards_insert_own on public.vision_cards
  for insert with check (
    user_id = auth.uid()
    and (project_id is null or public.can_access_project(project_id))
  );

drop policy if exists vision_cards_update_own on public.vision_cards;
create policy vision_cards_update_own on public.vision_cards
  for update using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (project_id is null or public.can_access_project(project_id))
  );

drop policy if exists vision_cards_delete_own on public.vision_cards;
create policy vision_cards_delete_own on public.vision_cards
  for delete using (user_id = auth.uid());
