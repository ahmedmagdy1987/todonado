-- ============================================================================
--  Todonado — recurring-task correctness (audit H2 + H5)
--
--  H2: persist a recurrence anchor so monthly/yearly tasks keep their intended
--      day-of-month (Jan 31 -> Feb 28 -> Mar 31, not Mar 28 forever). The client
--      computes occurrence dates from this anchor; the clamp is per-occurrence.
--
--  H5: complete-and-spawn becomes ATOMIC via one RPC (single transaction): the
--      compare-and-swap completion UPDATE and the next-occurrence INSERT both
--      commit or both roll back, so a failed spawn can never break the chain.
--
--  RLS is UNCHANGED. The RPC is SECURITY INVOKER, so the existing tasks_rw
--  policy (workspace membership + project/section co-location) governs BOTH
--  writes exactly as a direct client call — owner-only isolation is preserved,
--  with no privilege escalation. Idempotent.
-- ============================================================================

-- ---- H2: anchor column + backfill -----------------------------------------
alter table public.tasks
  add column if not exists recurrence_anchor date;

comment on column public.tasks.recurrence_anchor is
  'Stable anchor date for monthly/yearly recurrence so the intended day-of-month is preserved (month-end clamp is per-occurrence, not permanent). NULL for non-recurring / legacy rows.';

-- Backfill existing recurring tasks to their current scheduled/due date. Rows
-- that already drifted cannot recover their original day-of-month, but this stops
-- any further drift from here on. New tasks get a correct anchor at creation.
update public.tasks
   set recurrence_anchor = coalesce(scheduled_for, due_date)
 where recurrence_freq is not null
   and recurrence_anchor is null
   and coalesce(scheduled_for, due_date) is not null;

-- ---- H5: atomic complete + spawn ------------------------------------------
-- p_next is the next-occurrence row (the client's NewTaskInput as JSON), or NULL
-- to complete without spawning. Returns { task, spawned }.
create or replace function public.complete_task(p_task_id uuid, p_next jsonb default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_task    public.tasks;
  v_spawned boolean := false;
begin
  -- Atomic compare-and-swap: only a row the caller may write (RLS) AND not yet
  -- done. Of any concurrent completers exactly one wins here and spawns.
  update public.tasks
     set status = 'done', completed_at = now()
   where id = p_task_id
     and status <> 'done'
  returning * into v_task;

  if not found then
    -- Already done, or not accessible to this user: do not spawn.
    select * into v_task from public.tasks where id = p_task_id;
    if not found then
      raise exception 'Task % not found or not accessible', p_task_id
        using errcode = 'no_data_found';
    end if;
    return jsonb_build_object('task', to_jsonb(v_task), 'spawned', false);
  end if;

  -- Spawn the next occurrence in the SAME transaction. The INSERT is RLS-checked
  -- (tasks_rw WITH CHECK) just like a client insert; jsonb_populate_record maps
  -- the provided fields with correct types (dates, int[], etc.). id / status /
  -- timestamps are intentionally omitted so their column defaults apply.
  if p_next is not null and jsonb_typeof(p_next) = 'object' then
    insert into public.tasks (
      workspace_id, title, notes, project_id, section_id, effort_minutes, priority,
      due_date, scheduled_for, position,
      recurrence_freq, recurrence_interval, recurrence_weekdays, recurrence_until, recurrence_anchor
    )
    select
      r.workspace_id, r.title, r.notes, r.project_id, r.section_id, r.effort_minutes,
      coalesce(r.priority, 0),
      r.due_date, r.scheduled_for, coalesce(r.position, 0),
      r.recurrence_freq, coalesce(r.recurrence_interval, 1), r.recurrence_weekdays,
      r.recurrence_until, r.recurrence_anchor
    from jsonb_populate_record(null::public.tasks, p_next) as r;
    v_spawned := true;
  end if;

  return jsonb_build_object('task', to_jsonb(v_task), 'spawned', v_spawned);
end;
$$;

-- Only authenticated users complete tasks; anon has no business here.
revoke all on function public.complete_task(uuid, jsonb) from public;
grant execute on function public.complete_task(uuid, jsonb) to authenticated;
