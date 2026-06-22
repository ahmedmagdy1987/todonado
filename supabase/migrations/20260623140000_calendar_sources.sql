-- ============================================================================
--  Todonado — calendar busy-import sources (ICS) + events marker (Phase 3C)
--
--  Lets a user attach an .ics calendar so today's timed meetings subtract from
--  available capacity. Owner-only, mirroring the wellness_items conventions:
--  every row private to its owner (user_id = auth.uid()), enforced on every
--  action. No cross-user access of any kind.
--
--    * kind 'url'  — stores the .ics URL (fetched best-effort from the browser;
--                    often CORS-blocked — a reliable fetch needs an Edge proxy).
--    * kind 'file' — stores the raw uploaded .ics TEXT so today's busy minutes
--                    can be recomputed each local day without re-uploading.
--
--  Also widens the events CHECK with 'calendar_source_added' (insert-only RLS on
--  events is unchanged — this only allows the new event name).
--  Requires 20260623120000_events. Idempotent.
-- ============================================================================

create table if not exists public.calendar_sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('url', 'file')),
  label       text not null,
  url         text,        -- for kind 'url'
  ics_text    text,        -- for kind 'file' (raw .ics)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists calendar_sources_user_id_idx on public.calendar_sources (user_id);

-- updated_at trigger (reuses the shared function).
drop trigger if exists set_updated_at on public.calendar_sources;
create trigger set_updated_at before update on public.calendar_sources
  for each row execute function public.set_updated_at();

alter table public.calendar_sources enable row level security;

-- Owner-only, full CRUD.
drop policy if exists calendar_sources_select_own on public.calendar_sources;
create policy calendar_sources_select_own on public.calendar_sources
  for select using (user_id = auth.uid());

drop policy if exists calendar_sources_insert_own on public.calendar_sources;
create policy calendar_sources_insert_own on public.calendar_sources
  for insert with check (user_id = auth.uid());

drop policy if exists calendar_sources_update_own on public.calendar_sources;
create policy calendar_sources_update_own on public.calendar_sources
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists calendar_sources_delete_own on public.calendar_sources;
create policy calendar_sources_delete_own on public.calendar_sources
  for delete using (user_id = auth.uid());

-- ---- events: allow the 'calendar_source_added' adoption marker ----
alter table public.events drop constraint if exists events_event_check;
alter table public.events
  add constraint events_event_check check (event in (
    'task_created', 'effort_entered', 'template_applied', 'capacity_viewed',
    'over_capacity_hit', 'task_completed', 'focus_completed', 'day_returned',
    'auto_planned', 'calendar_source_added'
  ));
