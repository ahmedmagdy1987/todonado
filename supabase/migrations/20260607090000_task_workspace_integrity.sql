-- ============================================================================
--  Todonado — task ↔ workspace write integrity
--
--  Closes a write-integrity hole: the tasks RLS WITH CHECK only validated the
--  task's own workspace_id, so a member of workspace A could attach a task to a
--  project/section that lives in workspace B. We now require project_id and
--  section_id to resolve to the SAME workspace as the task.
-- ============================================================================

-- True owning workspace of a project / section, looked up with definer rights
-- so the check is deterministic regardless of the caller's RLS visibility.
-- search_path is pinned (no privilege-escalation surface), matching the other
-- SECURITY DEFINER helpers in this schema.
create or replace function public.project_workspace(_project_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select workspace_id from public.projects where id = _project_id;
$$;

create or replace function public.section_workspace(_section_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.workspace_id
  from public.sections s
  join public.projects p on p.id = s.project_id
  where s.id = _section_id;
$$;

-- Recreate the tasks policy with the co-location guard in WITH CHECK (gates
-- INSERT/UPDATE). USING (reads/deletes) stays workspace-membership only.
drop policy if exists tasks_rw on public.tasks;
create policy tasks_rw on public.tasks
  for all
  using (public.is_workspace_member(workspace_id))
  with check (
    public.is_workspace_member(workspace_id)
    and (project_id is null or public.project_workspace(project_id) = workspace_id)
    and (section_id is null or public.section_workspace(section_id) = workspace_id)
  );
