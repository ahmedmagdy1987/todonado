-- pgTAP test for the task ↔ workspace co-location guard
-- (migration 20260607090000_task_workspace_integrity.sql).
--
-- Run with the local Supabase stack:  supabase test db
-- (Not part of the JS/vitest gate — RLS can only be exercised against Postgres.)
--
-- NB: inserting into auth.users fires handle_new_user(), which auto-provisions a
-- default workspace + owner membership per user. We additionally create explicit
-- workspaces A and B (owned by users A and B) so the cross-workspace attempt is
-- unambiguous. is_workspace_member() is satisfied by owner_id, so no explicit
-- membership rows are needed.

begin;
select plan(4);

-- Two users.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a',
   'authenticated', 'authenticated', 'a@test.dev', '', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b',
   'authenticated', 'authenticated', 'b@test.dev', '', now(), now(), now(), '{}', '{}');

-- Workspace A (user A) and workspace B (user B) with a project + section in B.
insert into public.workspaces (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'WS A'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'WS B');
insert into public.projects (id, workspace_id, name) values
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Proj B');
insert into public.sections (id, project_id, name) values
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b2', 'Sec B');

-- Definer helper resolves the true owning workspace (runs as table owner here).
select is(
  public.project_workspace('00000000-0000-0000-0000-0000000000b2'),
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  'project_workspace resolves the owning workspace'
);

-- Act as user A (member of workspace A only).
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',
  true
);

-- A can create a plain task in their own workspace.
select lives_ok(
  $$insert into public.tasks (workspace_id, title)
    values ('00000000-0000-0000-0000-0000000000a1', 'ok task')$$,
  'member can insert a task (no project) in their own workspace'
);

-- A cannot attach a workspace-A task to a project that lives in workspace B.
select throws_ok(
  $$insert into public.tasks (workspace_id, title, project_id)
    values ('00000000-0000-0000-0000-0000000000a1', 'cross-ws-project',
            '00000000-0000-0000-0000-0000000000b2')$$,
  '42501',
  null,
  'cross-workspace project_id is rejected by RLS WITH CHECK'
);

-- ...nor to a section that lives in workspace B.
select throws_ok(
  $$insert into public.tasks (workspace_id, title, section_id)
    values ('00000000-0000-0000-0000-0000000000a1', 'cross-ws-section',
            '00000000-0000-0000-0000-0000000000b3')$$,
  '42501',
  null,
  'cross-workspace section_id is rejected by RLS WITH CHECK'
);

select finish();
rollback;
