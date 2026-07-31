-- ============================================================================
--  Todonado — length caps for the tables that predate the caps convention
--  (audit FLAG-9, docs/AUDIT_2026-07-31_prelaunch2.md)
--
--  ── STATUS: COMMITTED, NOT APPLIED. NOTHING IN THE CLOUD HAS CHANGED. ──────
--
--  This file lives in docs/, NOT in supabase/migrations/, and that is a
--  deliberate choice rather than an oversight.
--
--  The repo's whole migration discipline is "nothing is pending" — CLAUDE.md §7
--  and the launch checklist both say so, and a session that finds an unapplied
--  file in supabase/migrations/ is being invited to run `supabase db push`,
--  which those same documents forbid. An unapplied migration sitting in the
--  migrations folder is exactly the contradiction that took a whole commit to
--  clean up earlier today. So the SQL is here, reviewable and ready, and it
--  becomes a real migration the moment you decide to apply it.
--
--  ── WHY IT IS WANTED ──────────────────────────────────────────────────────
--  Size CHECKs exist on every table added from 2026-07-28 onward
--  (user_templates, quit_habits, vision_cards, mind_maps, user_challenges,
--  journal_entries) and on none of the tables that came before. CLAUDE.md's own
--  rule is "the client is assumed hostile; never rely on client-side
--  filtering", and for these columns the only limit is a maxLength attribute in
--  a form — or, for tasks, not even that.
--
--  TODAY the damage is self-inflicted: an account holder can bloat their own
--  rows, inflate the storage bill, and wedge their own client. The sharpest
--  case is calendar_sources.ics_text, capped at 1 MB in the BROWSER only
--  (CalendarSettings.tsx:16) and re-parsed on every Today and Week render, so
--  an oversized row makes the app unusable for the person who wrote it in a way
--  the UI cannot repair.
--
--  TOMORROW it stops being self-inflicted. tasks, projects and sections are
--  WORKSPACE-scoped and workspace_members is documented as collaboration-ready:
--  the day shared workspaces ship, a 10 MB task title written by one member is
--  a denial of service against everyone else in that workspace, with no
--  server-side stop.
--
--  ── BEFORE APPLYING ───────────────────────────────────────────────────────
--  Adding a CHECK validates existing rows and FAILS if any row violates it.
--  Run section 0 first and confirm it returns no rows. On a project with real
--  users, consider `NOT VALID` + a later `VALIDATE CONSTRAINT` instead, so the
--  write lock is brief.
--
--  The limits below mirror the client caps that already exist, so nothing a
--  user can type through the UI is rejected.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. DRY RUN. Every row that would violate a constraint below. Expect zero.
-- ---------------------------------------------------------------------------
select 'tasks.title'            as col, count(*) from public.tasks             where char_length(title) > 500
union all select 'tasks.notes',            count(*) from public.tasks             where char_length(notes) > 20000
union all select 'projects.name',          count(*) from public.projects          where char_length(name) > 200
union all select 'sections.name',          count(*) from public.sections          where char_length(name) > 200
union all select 'subtasks.title',         count(*) from public.subtasks          where char_length(title) > 500
union all select 'profiles.display_name',  count(*) from public.profiles          where char_length(display_name) > 120
union all select 'profiles.full_name',     count(*) from public.profiles          where char_length(full_name) > 120
union all select 'wellness_items.name',    count(*) from public.wellness_items    where char_length(name) > 200
union all select 'wellness_items.dose',    count(*) from public.wellness_items    where char_length(dose) > 200
union all select 'wellness_items.schedule',count(*) from public.wellness_items    where char_length(schedule) > 200
union all select 'wellness_items.notes',   count(*) from public.wellness_items    where char_length(notes) > 2000
union all select 'calendar_sources.label', count(*) from public.calendar_sources  where char_length(label) > 200
union all select 'calendar_sources.url',   count(*) from public.calendar_sources  where char_length(url) > 2048
union all select 'calendar_sources.ics',   count(*) from public.calendar_sources  where pg_column_size(ics_text) > 1048576;

-- ---------------------------------------------------------------------------
-- 1. THE CONSTRAINTS. Re-runnable: each is added only if absent.
-- ---------------------------------------------------------------------------
do $$
begin
  -- tasks ---------------------------------------------------------------
  if not exists (select 1 from pg_constraint where conname = 'tasks_title_len') then
    alter table public.tasks add constraint tasks_title_len
      check (char_length(title) between 1 and 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_notes_len') then
    alter table public.tasks add constraint tasks_notes_len
      check (notes is null or char_length(notes) <= 20000);
  end if;

  -- projects / sections / subtasks ---------------------------------------
  if not exists (select 1 from pg_constraint where conname = 'projects_name_len') then
    alter table public.projects add constraint projects_name_len
      check (char_length(name) between 1 and 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sections_name_len') then
    alter table public.sections add constraint sections_name_len
      check (char_length(name) between 1 and 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subtasks_title_len') then
    alter table public.subtasks add constraint subtasks_title_len
      check (char_length(title) between 1 and 500);
  end if;

  -- profiles -------------------------------------------------------------
  -- `username` already has ^[A-Za-z0-9_]{3,30}$ from 20260616120000.
  if not exists (select 1 from pg_constraint where conname = 'profiles_display_name_len') then
    alter table public.profiles add constraint profiles_display_name_len
      check (display_name is null or char_length(display_name) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_full_name_len') then
    alter table public.profiles add constraint profiles_full_name_len
      check (full_name is null or char_length(full_name) <= 120);
  end if;

  -- wellness_items (health-adjacent free text) ----------------------------
  if not exists (select 1 from pg_constraint where conname = 'wellness_items_len') then
    alter table public.wellness_items add constraint wellness_items_len
      check (
        char_length(name) between 1 and 200
        and (dose is null or char_length(dose) <= 200)
        and (schedule is null or char_length(schedule) <= 200)
        and (notes is null or char_length(notes) <= 2000)
      );
  end if;

  -- calendar_sources — the one that can wedge a client ---------------------
  -- 1 MB matches MAX_ICS_BYTES in src/features/calendar/CalendarSettings.tsx.
  if not exists (select 1 from pg_constraint where conname = 'calendar_sources_len') then
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
--  * Move this file to supabase/migrations/<timestamp>_length_caps.sql so the
--    history records it, and update CLAUDE.md §7's "applied through" line.
--  * Add `maxLength` to the task-title input in
--    src/features/tasks/components/QuickAdd.tsx — today it only calls .trim().
--  * Extend the existing caps-pinning pattern (personalCaps.test.ts,
--    quitCaps.test.ts, mindMapCaps.test.ts all read the migration and assert
--    the client constant equals the DB CHECK) to cover these, so the two can
--    never drift apart.
-- ---------------------------------------------------------------------------
