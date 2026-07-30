-- ============================================================================
--  Todonado — mind_maps (the shape of an idea, before it becomes a task list)
--
--  Vision records WHY. Projects record HOW work is grouped. Neither can hold a
--  thought that is still branching — the stage where you do not yet know which
--  bits are tasks and which are context. A mind map is that stage: nodes you can
--  drag anywhere and lines you can draw between them.
--
--  ONE ROW PER MAP, GRAPH IN JSONB — deliberately, and this is the main design
--  decision in the file. The alternative (mind_map_nodes + mind_map_edges tables)
--  means a drag is an UPDATE, an undo is a transaction, and opening a map is
--  three round trips that can arrive out of order and render a half-graph. A map
--  is only ever read, edited and saved AS A WHOLE by exactly one owner, so it has
--  none of the concurrent-write pressure that would justify normalising it. The
--  cost of this choice is that the database cannot enforce the graph's internal
--  shape with foreign keys; `mind_map_links_ok` below closes the one part of that
--  gap that actually matters (see the next paragraph), and the client normalises
--  everything else on read (`normaliseMap` in graph.ts), so a malformed or
--  hand-edited row degrades to a smaller valid map rather than a crash.
--
--  THE PROJECT / TASK LINK IS GUARDED, not merely stored. A node may say "this
--  idea is that project" or "…that task". Both are workspace-scoped while this
--  table is user-scoped, so owner-only RLS on its own would let a hostile client
--  park an id it cannot read inside its own jsonb and use the row as an oracle.
--  `mind_map_links_ok` walks the nodes and requires can_access_project /
--  can_access_task for every link present — the same SECURITY DEFINER helpers
--  every workspace-scoped table uses — and it is applied to INSERT and UPDATE,
--  exactly as vision_cards guards its project_id column.
--
--  A malformed id is REJECTED, NOT CAST. `'abc'::uuid` raises 22P02, which
--  aborts the statement with a Postgres parse error instead of a clean policy
--  denial; the regex guard means a junk id simply fails the check and the write
--  is refused the same way every other violation is.
--
--  OWNER-ONLY, mirroring vision_cards / wellness_items: every row is private to
--  its owner (user_id = auth.uid()), enforced on every action, with no anon
--  access of any kind. Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.mind_maps (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  -- [{ id, title, note, x, y, color, root?, projectId?, taskId? }]
  nodes      jsonb not null default '[]'::jsonb,
  -- [{ id, from, to }] — `from`/`to` reference node ids within THIS row.
  edges      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mind_maps_user_id_idx on public.mind_maps (user_id);

-- ---------------------------------------------------------------------------
--  Link guard: every project/task a node points at must be readable by the
--  caller. STABLE + SECURITY DEFINER so it can consult workspace membership the
--  caller cannot select directly, exactly like can_access_project itself.
--
--  Returns TRUE for a map with no links at all (bool_and over zero rows is null,
--  hence the coalesce) — an unlinked map is perfectly valid and must not be
--  refused.
-- ---------------------------------------------------------------------------
create or replace function public.mind_map_links_ok(_nodes jsonb)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    bool_and(
      case
        when n ->> 'projectId' is null then true
        when n ->> 'projectId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then false
        else public.can_access_project((n ->> 'projectId')::uuid)
      end
      and
      case
        when n ->> 'taskId' is null then true
        when n ->> 'taskId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then false
        else public.can_access_task((n ->> 'taskId')::uuid)
      end
    ),
    true
  )
  -- Guarded: jsonb_array_elements raises on a non-array, and the shape CHECK
  -- below is not yet proven at the moment a policy runs.
  from jsonb_array_elements(
    case when jsonb_typeof(_nodes) = 'array' then _nodes else '[]'::jsonb end
  ) as n;
$$;

revoke all on function public.mind_map_links_ok(jsonb) from public;
grant execute on function public.mind_map_links_ok(jsonb) to authenticated;

-- ---- size + shape guards (added separately so re-running is safe) ----------
--
--  The count caps keep a map something a person made; the BYTE caps are the ones
--  that actually bound the row, because 200 nodes with a novel in every note
--  would otherwise be megabytes. Node title/note lengths are validated on the
--  client (graph.ts) and backstopped here by the byte cap rather than by a
--  per-element CHECK — walking the array on every write to re-derive what the
--  byte cap already bounds would cost more than it protects.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mind_maps_title_len') then
    alter table public.mind_maps
      add constraint mind_maps_title_len
      check (char_length(btrim(title)) between 1 and 80);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'mind_maps_nodes_array') then
    alter table public.mind_maps
      add constraint mind_maps_nodes_array
      check (jsonb_typeof(nodes) = 'array');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'mind_maps_edges_array') then
    alter table public.mind_maps
      add constraint mind_maps_edges_array
      check (jsonb_typeof(edges) = 'array');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'mind_maps_nodes_count') then
    alter table public.mind_maps
      add constraint mind_maps_nodes_count
      check (jsonb_array_length(nodes) <= 200);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'mind_maps_edges_count') then
    alter table public.mind_maps
      add constraint mind_maps_edges_count
      check (jsonb_array_length(edges) <= 400);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'mind_maps_nodes_bytes') then
    alter table public.mind_maps
      add constraint mind_maps_nodes_bytes
      check (pg_column_size(nodes) <= 65536);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'mind_maps_edges_bytes') then
    alter table public.mind_maps
      add constraint mind_maps_edges_bytes
      check (pg_column_size(edges) <= 65536);
  end if;
end $$;

-- updated_at trigger (reuses the shared function from the initial schema).
drop trigger if exists set_updated_at on public.mind_maps;
create trigger set_updated_at before update on public.mind_maps
  for each row execute function public.set_updated_at();

alter table public.mind_maps enable row level security;

-- ---- RLS: owner-only, full CRUD, plus the node-link guard -------------------
drop policy if exists mind_maps_select_own on public.mind_maps;
create policy mind_maps_select_own on public.mind_maps
  for select using (user_id = auth.uid());

drop policy if exists mind_maps_insert_own on public.mind_maps;
create policy mind_maps_insert_own on public.mind_maps
  for insert with check (
    user_id = auth.uid()
    and public.mind_map_links_ok(nodes)
  );

drop policy if exists mind_maps_update_own on public.mind_maps;
create policy mind_maps_update_own on public.mind_maps
  for update using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and public.mind_map_links_ok(nodes)
  );

drop policy if exists mind_maps_delete_own on public.mind_maps;
create policy mind_maps_delete_own on public.mind_maps
  for delete using (user_id = auth.uid());
