-- ============================================================================
--  Todonado — user_templates (personal, reusable task lists)
--
--  Lets a user turn their OWN recurring work into a template they can reapply,
--  alongside the 55 built-in ones. `tasks` deliberately stores the SAME shape as
--  the built-in catalog ([{ title, effortMinutes, section?, note? }]), so ONE
--  apply path serves both and there is no forked logic to drift.
--
--  OWNER-ONLY, mirroring wellness_items exactly: every row is private to its
--  owner (user_id = auth.uid()), enforced on every action. No cross-user access
--  of any kind, and no anon access at all.
--
--  SIZE SANITY: the CHECKs below are a backstop for the client-side caps, so a
--  hostile or buggy client can never store megabytes per row.
--  Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.user_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  description text,
  icon        text,   -- optional lucide icon name (validated against the client allow-list)
  color       text,   -- optional project color token
  tasks       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists user_templates_user_id_idx on public.user_templates (user_id);

-- ---- size + shape guards (added separately so re-running is safe) ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_templates_title_len') then
    alter table public.user_templates
      add constraint user_templates_title_len
      check (char_length(btrim(title)) between 1 and 80);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_templates_description_len') then
    alter table public.user_templates
      add constraint user_templates_description_len
      check (description is null or char_length(description) <= 280);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_templates_icon_len') then
    alter table public.user_templates
      add constraint user_templates_icon_len
      check (icon is null or char_length(icon) <= 40);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_templates_color_len') then
    alter table public.user_templates
      add constraint user_templates_color_len
      check (color is null or char_length(color) <= 32);
  end if;

  -- Must be a JSON ARRAY of at most 100 entries...
  if not exists (select 1 from pg_constraint where conname = 'user_templates_tasks_shape') then
    alter table public.user_templates
      add constraint user_templates_tasks_shape
      check (jsonb_typeof(tasks) = 'array' and jsonb_array_length(tasks) <= 100);
  end if;

  -- ...and bounded in bytes, so 100 entries still can't be megabytes.
  if not exists (select 1 from pg_constraint where conname = 'user_templates_tasks_bytes') then
    alter table public.user_templates
      add constraint user_templates_tasks_bytes
      check (pg_column_size(tasks) <= 65536);
  end if;
end $$;

-- updated_at trigger (reuses the shared function from the initial schema).
drop trigger if exists set_updated_at on public.user_templates;
create trigger set_updated_at before update on public.user_templates
  for each row execute function public.set_updated_at();

alter table public.user_templates enable row level security;

-- ---- RLS: owner-only, full CRUD (identical shape to wellness_items) --------
drop policy if exists user_templates_select_own on public.user_templates;
create policy user_templates_select_own on public.user_templates
  for select using (user_id = auth.uid());

drop policy if exists user_templates_insert_own on public.user_templates;
create policy user_templates_insert_own on public.user_templates
  for insert with check (user_id = auth.uid());

drop policy if exists user_templates_update_own on public.user_templates;
create policy user_templates_update_own on public.user_templates
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_templates_delete_own on public.user_templates;
create policy user_templates_delete_own on public.user_templates
  for delete using (user_id = auth.uid());
