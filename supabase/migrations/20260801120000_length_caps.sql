-- ============================================================================
--  Todonado — length caps for the tables that predate the caps convention
--  (audit FLAG-9, docs/AUDIT_2026-07-31_prelaunch2.md)
--
--  ⚠️  STATUS: COMMITTED, **NOT APPLIED**. See CLAUDE.md §7.
--      Applying it is one command, and it is the OWNER'S to run:
--
--          supabase db push
--
--      Nothing else in supabase/migrations/ is pending. Do not run anything
--      else, and do not re-run the applied files.
--
--  ── WHY THIS EXISTS ────────────────────────────────────────────────────────
--  Size CHECKs exist on every table added from 2026-07-28 onward
--  (user_templates, quit_habits, vision_cards, mind_maps, user_challenges,
--  journal_entries) and on none of the tables that came before. CLAUDE.md's own
--  rule is "the client is assumed hostile; never rely on client-side
--  filtering", and for these columns the only limit is a maxLength attribute in
--  a form.
--
--  TODAY the damage is self-inflicted: an account holder can bloat their own
--  rows, inflate the storage bill, and wedge their own client. The sharpest
--  case is calendar_sources.ics_text, capped at 1 MB in the BROWSER only and
--  re-parsed on every Today and Week render, so an oversized row makes the app
--  unusable for the person who wrote it in a way the UI cannot repair.
--
--  TOMORROW it stops being self-inflicted. tasks, projects and sections are
--  WORKSPACE-scoped and workspace_members is documented as collaboration-ready:
--  the day shared workspaces ship, a 10 MB task title written by one member is
--  a denial of service against everyone else in that workspace, with no
--  server-side stop.
--
--  ── THE NUMBERS ARE NOT WRITTEN TWICE ──────────────────────────────────────
--  Every limit below is pinned to `src/lib/limits.ts` by `limits.test.ts`,
--  which parses THIS FILE constraint by constraint and asserts each one carries
--  the client's number. Raise a cap in one place and the suite fails until the
--  other agrees. That is what stops the two halves drifting in the window
--  between this file being committed and being applied.
--
--  ── BEFORE YOU RUN IT ──────────────────────────────────────────────────────
--  Adding a CHECK validates every existing row and FAILS the whole migration if
--  one violates it. Run the dry run in section 0 first and confirm it returns
--  zero everywhere. It checks BOTH bounds: the minimums matter as much as the
--  maximums here, because `between 1 and N` also rejects an EMPTY string on the
--  not-null columns, and an empty title is far likelier to already exist than a
--  500-character one. (The version of this file that lived in docs/ only looked
--  for oversized rows, so it would have reported a clean bill of health and
--  then failed on push.)
--
--  On a table with real volume, prefer `add constraint … not valid` followed by
--  `validate constraint` in a second statement: the first takes a brief lock and
--  the second scans without blocking writes. At this project's size the plain
--  form below is a few milliseconds, so it is not worth the extra moving part.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. DRY RUN — run this BY HAND first. Every count must be zero.
--
--    Deliberately commented out rather than executed. A migration that returns
--    a result set has nowhere to put it: `db push` discards it, so it would
--    look like it had passed while telling nobody anything.
-- ---------------------------------------------------------------------------
--
--  select 'tasks.title'             as col, count(*) from public.tasks            where char_length(title) not between 1 and 500
--  union all select 'tasks.notes',            count(*) from public.tasks            where notes is not null and char_length(notes) > 20000
--  union all select 'projects.name',          count(*) from public.projects         where char_length(name) not between 1 and 200
--  union all select 'sections.name',          count(*) from public.sections         where char_length(name) not between 1 and 200
--  union all select 'subtasks.title',         count(*) from public.subtasks         where char_length(title) not between 1 and 500
--  union all select 'profiles.display_name',  count(*) from public.profiles         where display_name is not null and char_length(display_name) > 120
--  union all select 'profiles.full_name',     count(*) from public.profiles         where full_name is not null and char_length(full_name) > 120
--  union all select 'wellness_items.name',    count(*) from public.wellness_items   where char_length(name) not between 1 and 200
--  union all select 'wellness_items.dose',    count(*) from public.wellness_items   where dose is not null and char_length(dose) > 200
--  union all select 'wellness_items.schedule',count(*) from public.wellness_items   where schedule is not null and char_length(schedule) > 200
--  union all select 'wellness_items.notes',   count(*) from public.wellness_items   where notes is not null and char_length(notes) > 2000
--  union all select 'calendar_sources.label', count(*) from public.calendar_sources where char_length(label) not between 1 and 200
--  union all select 'calendar_sources.url',   count(*) from public.calendar_sources where url is not null and char_length(url) > 2048
--  union all select 'calendar_sources.ics',   count(*) from public.calendar_sources where ics_text is not null and pg_column_size(ics_text) > 1048576;
--


-- ---------------------------------------------------------------------------
-- 1. THE CONSTRAINTS
--
--    Re-runnable: each is added only if absent. The existence check matches on
--    `conrelid` AS WELL AS `conname`, because a constraint name is unique per
--    TABLE and not per database — checking the name alone would silently skip
--    the work if any other table ever carried the same name.
--
--    Nullable columns are written `col is null or …` rather than relying on
--    `between` returning NULL for a NULL input. Both pass a CHECK, but only one
--    of them says so to the next reader.
-- ---------------------------------------------------------------------------
do $$
begin
  -- tasks -------------------------------------------------------------------
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_title_len' and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks add constraint tasks_title_len
      check (char_length(title) between 1 and 500);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_notes_len' and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks add constraint tasks_notes_len
      check (notes is null or char_length(notes) <= 20000);
  end if;

  -- projects / sections / subtasks -------------------------------------------
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_name_len' and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects add constraint projects_name_len
      check (char_length(name) between 1 and 200);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sections_name_len' and conrelid = 'public.sections'::regclass
  ) then
    alter table public.sections add constraint sections_name_len
      check (char_length(name) between 1 and 200);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'subtasks_title_len' and conrelid = 'public.subtasks'::regclass
  ) then
    alter table public.subtasks add constraint subtasks_title_len
      check (char_length(title) between 1 and 500);
  end if;

  -- profiles ------------------------------------------------------------------
  -- `username` already has ^[A-Za-z0-9_]{3,30}$ from 20260616120000, which is
  -- both a length and a shape cap, so it is deliberately not repeated here.
  -- `full_name` is added by that same migration; it is not in the initial schema.
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_display_name_len' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_display_name_len
      check (display_name is null or char_length(display_name) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_full_name_len' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_full_name_len
      check (full_name is null or char_length(full_name) <= 120);
  end if;

  -- wellness_items (health-adjacent free text) ---------------------------------
  if not exists (
    select 1 from pg_constraint
    where conname = 'wellness_items_len' and conrelid = 'public.wellness_items'::regclass
  ) then
    alter table public.wellness_items add constraint wellness_items_len
      check (
        char_length(name) between 1 and 200
        and (dose is null or char_length(dose) <= 200)
        and (schedule is null or char_length(schedule) <= 200)
        and (notes is null or char_length(notes) <= 2000)
      );
  end if;

  -- calendar_sources — the one that can wedge a client -------------------------
  -- 1 MB matches MAX_ICS_BYTES in src/features/calendar/CalendarSettings.tsx.
  -- `pg_column_size` measures the STORED size, which for a compressible .ics is
  -- smaller than its character count; that is the number that matters here,
  -- because what hurts is the row being fetched and re-parsed on every render.
  if not exists (
    select 1 from pg_constraint
    where conname = 'calendar_sources_len' and conrelid = 'public.calendar_sources'::regclass
  ) then
    alter table public.calendar_sources add constraint calendar_sources_len
      check (
        char_length(label) between 1 and 200
        and (url is null or char_length(url) <= 2048)
        and (ics_text is null or pg_column_size(ics_text) <= 1048576)
      );
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. AFTER APPLYING
-- ---------------------------------------------------------------------------
--  * Update CLAUDE.md §7's "applied through" line to name this file, and remove
--    it from the "pending" box. That box is the only thing standing between the
--    next session and a forbidden `db push`.
--  * Nothing in the client needs to change. `src/lib/limits.ts` already carries
--    these numbers and every affected input already enforces them, so no input
--    a user can produce through the UI becomes newly rejected on the day this
--    runs. That was the point of doing the client half first.
-- ---------------------------------------------------------------------------
