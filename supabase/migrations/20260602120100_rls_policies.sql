-- ============================================================================
--  Todonado — Row Level Security
--
--  Isolation model: a user may read/write rows only within workspaces they
--  OWN or are a MEMBER of. Membership checks run through SECURITY DEFINER
--  helper functions so policies never recurse into RLS-protected tables.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  Access helpers (SECURITY DEFINER => bypass RLS, no recursion)
-- ----------------------------------------------------------------------------
create or replace function public.is_workspace_member(_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = _workspace_id and w.owner_id = auth.uid()
  ) or exists (
    select 1 from public.workspace_members m
    where m.workspace_id = _workspace_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_owner(_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = _workspace_id and w.owner_id = auth.uid()
  );
$$;

create or replace function public.can_access_project(_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_workspace_member(
    (select workspace_id from public.projects where id = _project_id)
  );
$$;

create or replace function public.can_access_task(_task_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_workspace_member(
    (select workspace_id from public.tasks where id = _task_id)
  );
$$;

-- ----------------------------------------------------------------------------
--  profiles — users manage only their own profile
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ----------------------------------------------------------------------------
--  workspaces — members read; only the owner mutates
-- ----------------------------------------------------------------------------
alter table public.workspaces enable row level security;

drop policy if exists workspaces_select_members on public.workspaces;
create policy workspaces_select_members on public.workspaces
  for select using (public.is_workspace_member(id));

drop policy if exists workspaces_insert_owner on public.workspaces;
create policy workspaces_insert_owner on public.workspaces
  for insert with check (owner_id = auth.uid());

drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner on public.workspaces
  for update using (public.is_workspace_owner(id)) with check (public.is_workspace_owner(id));

drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner on public.workspaces
  for delete using (public.is_workspace_owner(id));

-- ----------------------------------------------------------------------------
--  workspace_members — members read; only the owner manages membership
-- ----------------------------------------------------------------------------
alter table public.workspace_members enable row level security;

drop policy if exists members_select on public.workspace_members;
create policy members_select on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists members_insert_owner on public.workspace_members;
create policy members_insert_owner on public.workspace_members
  for insert with check (public.is_workspace_owner(workspace_id));

drop policy if exists members_update_owner on public.workspace_members;
create policy members_update_owner on public.workspace_members
  for update using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));

drop policy if exists members_delete_owner on public.workspace_members;
create policy members_delete_owner on public.workspace_members
  for delete using (public.is_workspace_owner(workspace_id));

-- ----------------------------------------------------------------------------
--  projects / sections / tasks / subtasks — full access within the workspace
-- ----------------------------------------------------------------------------
alter table public.projects enable row level security;
drop policy if exists projects_rw on public.projects;
create policy projects_rw on public.projects
  for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

alter table public.sections enable row level security;
drop policy if exists sections_rw on public.sections;
create policy sections_rw on public.sections
  for all
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

alter table public.tasks enable row level security;
drop policy if exists tasks_rw on public.tasks;
create policy tasks_rw on public.tasks
  for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

alter table public.subtasks enable row level security;
drop policy if exists subtasks_rw on public.subtasks;
create policy subtasks_rw on public.subtasks
  for all
  using (public.can_access_task(task_id))
  with check (public.can_access_task(task_id));
