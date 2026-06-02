-- ============================================================================
--  Todonado — focus_sessions (task-bound focus mode)
--  Workspace-scoped, RLS mirroring tasks/projects. Additive & idempotent.
--
--  paused_at + accumulated_paused_seconds let the timer compute elapsed purely
--  from timestamps (drift-resistant) and resume correctly after a page reload.
-- ============================================================================

create table if not exists public.focus_sessions (
  id                          uuid primary key default gen_random_uuid(),
  workspace_id                uuid not null references public.workspaces (id) on delete cascade,
  task_id                     uuid references public.tasks (id) on delete set null,
  planned_minutes             integer not null check (planned_minutes > 0),
  started_at                  timestamptz not null default now(),
  ended_at                    timestamptz,
  actual_seconds              integer not null default 0 check (actual_seconds >= 0),
  interruptions               integer not null default 0 check (interruptions >= 0),
  status                      text not null default 'running'
                                check (status in ('running', 'completed', 'abandoned')),
  paused_at                   timestamptz,
  accumulated_paused_seconds  integer not null default 0 check (accumulated_paused_seconds >= 0),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists focus_sessions_workspace_id_idx on public.focus_sessions (workspace_id);
create index if not exists focus_sessions_task_id_idx       on public.focus_sessions (task_id);
create index if not exists focus_sessions_status_idx        on public.focus_sessions (status);
create index if not exists focus_sessions_started_at_idx    on public.focus_sessions (started_at);

-- updated_at trigger (reuses the shared function)
drop trigger if exists set_updated_at on public.focus_sessions;
create trigger set_updated_at before update on public.focus_sessions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
--  RLS — workspace isolation, mirroring tasks/projects
-- ----------------------------------------------------------------------------
alter table public.focus_sessions enable row level security;

drop policy if exists focus_sessions_rw on public.focus_sessions;
create policy focus_sessions_rw on public.focus_sessions
  for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ----------------------------------------------------------------------------
--  Realtime (publication + full old-row for filtered DELETE events)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'focus_sessions'
  ) then
    execute 'alter publication supabase_realtime add table public.focus_sessions';
  end if;
end
$$;

alter table public.focus_sessions replica identity full;
