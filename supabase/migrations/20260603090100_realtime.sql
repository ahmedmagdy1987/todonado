-- ============================================================================
--  Todonado — realtime publication
--  Add task-engine tables to the supabase_realtime publication so the client
--  can subscribe to changes. Idempotent.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'projects', 'sections', 'subtasks']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- DELETE payloads only include columns in the table's REPLICA IDENTITY. The
-- client filters tasks/projects subscriptions by workspace_id, so include the
-- full OLD row on delete; otherwise filtered DELETE events would be dropped.
alter table public.tasks replica identity full;
alter table public.projects replica identity full;
