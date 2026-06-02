-- ============================================================================
--  Todonado — initial schema
--  Tables, constraints, indexes, and updated_at triggers.
--  Row-level security policies are defined in the next migration.
-- ============================================================================

create extension if not exists "pgcrypto"; -- provides gen_random_uuid()

-- ----------------------------------------------------------------------------
--  Helper: keep updated_at fresh on every UPDATE
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
--  profiles  (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  workspaces
-- ----------------------------------------------------------------------------
create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null default 'My Workspace',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspaces_owner_id_idx on public.workspaces (owner_id);

-- ----------------------------------------------------------------------------
--  workspace_members  (collaboration-ready; composite PK)
-- ----------------------------------------------------------------------------
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','admin','member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_id_idx on public.workspace_members (user_id);

-- ----------------------------------------------------------------------------
--  projects
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  color        text not null default '#6C5CE7',
  status       text not null default 'active' check (status in ('active','archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists projects_workspace_id_idx on public.projects (workspace_id);

-- ----------------------------------------------------------------------------
--  sections
-- ----------------------------------------------------------------------------
create table if not exists public.sections (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sections_project_id_idx on public.sections (project_id);

-- ----------------------------------------------------------------------------
--  tasks
--  effort_minutes + scheduled_for power the MVP differentiator:
--  effort-aware day planning with a capacity meter.
-- ----------------------------------------------------------------------------
create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  project_id     uuid references public.projects (id) on delete set null,
  section_id     uuid references public.sections (id) on delete set null,
  title          text not null,
  notes          text,
  status         text not null default 'todo' check (status in ('todo','in_progress','done','cancelled')),
  priority       smallint not null default 0 check (priority between 0 and 3),
  due_date       date,
  effort_minutes integer check (effort_minutes is null or effort_minutes >= 0),
  scheduled_for  date,
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz
);
create index if not exists tasks_workspace_id_idx  on public.tasks (workspace_id);
create index if not exists tasks_project_id_idx    on public.tasks (project_id);
create index if not exists tasks_section_id_idx    on public.tasks (section_id);
create index if not exists tasks_scheduled_for_idx on public.tasks (scheduled_for);
create index if not exists tasks_status_idx        on public.tasks (status);

-- ----------------------------------------------------------------------------
--  subtasks
-- ----------------------------------------------------------------------------
create table if not exists public.subtasks (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  title      text not null,
  done       boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subtasks_task_id_idx on public.subtasks (task_id);

-- ----------------------------------------------------------------------------
--  updated_at triggers
-- ----------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.workspaces;
create trigger set_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.projects;
create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.sections;
create trigger set_updated_at before update on public.sections
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.tasks;
create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.subtasks;
create trigger set_updated_at before update on public.subtasks
  for each row execute function public.set_updated_at();
