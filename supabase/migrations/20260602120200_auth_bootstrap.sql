-- ============================================================================
--  Todonado — auth bootstrap
--
--  When a new auth user is created, automatically provision:
--    1. their profile row
--    2. a default workspace they own
--    3. their owner membership in that workspace
--
--  Runs as SECURITY DEFINER so it bypasses RLS during provisioning.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _workspace_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.workspaces (owner_id, name)
  values (new.id, 'My Workspace')
  returning id into _workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (_workspace_id, new.id, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
