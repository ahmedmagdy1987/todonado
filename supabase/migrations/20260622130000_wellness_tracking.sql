-- ============================================================================
--  Todonado — wellness tracking (supplement / vitamin / medication log)
--
--  A PERSONAL LOG ONLY. There is deliberately NO drug database, NO interaction
--  or contraindication checks, NO dosing recommendations, and NO medical advice
--  anywhere in this schema. `dose` and `schedule` are FREE TEXT the user types
--  (e.g. "500mg", "8am") — not a structured medical/scheduling engine.
--
--  Two owner-only tables, mirroring the app's RLS conventions:
--    * wellness_items — the things a user logs (mutable; updated_at + trigger).
--    * wellness_logs  — an append-only "taken" history (one row per mark-taken).
--  RLS: every row is private to its owner (user_id = auth.uid()), enforced on
--  every action. No cross-user access of any kind.
-- ============================================================================

create table if not exists public.wellness_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  dose        text,   -- free text, e.g. "500mg"
  schedule    text,   -- free text, e.g. "daily" / "8am" — NOT a medical schedule engine
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists wellness_items_user_id_idx on public.wellness_items (user_id);

create table if not exists public.wellness_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  item_id     uuid not null references public.wellness_items (id) on delete cascade,
  taken_at    timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists wellness_logs_user_id_idx on public.wellness_logs (user_id);
create index if not exists wellness_logs_item_id_idx on public.wellness_logs (item_id);

-- updated_at trigger on the mutable items table (reuses the shared function).
drop trigger if exists set_updated_at on public.wellness_items;
create trigger set_updated_at before update on public.wellness_items
  for each row execute function public.set_updated_at();

alter table public.wellness_items enable row level security;
alter table public.wellness_logs enable row level security;

-- ----------------------------------------------------------------------------
--  wellness_items — owner-only, full CRUD
-- ----------------------------------------------------------------------------
drop policy if exists wellness_items_select_own on public.wellness_items;
create policy wellness_items_select_own on public.wellness_items
  for select using (user_id = auth.uid());

drop policy if exists wellness_items_insert_own on public.wellness_items;
create policy wellness_items_insert_own on public.wellness_items
  for insert with check (user_id = auth.uid());

drop policy if exists wellness_items_update_own on public.wellness_items;
create policy wellness_items_update_own on public.wellness_items
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists wellness_items_delete_own on public.wellness_items;
create policy wellness_items_delete_own on public.wellness_items
  for delete using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
--  wellness_logs — owner-only; append-only events (select / insert / delete)
-- ----------------------------------------------------------------------------
drop policy if exists wellness_logs_select_own on public.wellness_logs;
create policy wellness_logs_select_own on public.wellness_logs
  for select using (user_id = auth.uid());

drop policy if exists wellness_logs_insert_own on public.wellness_logs;
create policy wellness_logs_insert_own on public.wellness_logs
  for insert with check (user_id = auth.uid());

drop policy if exists wellness_logs_delete_own on public.wellness_logs;
create policy wellness_logs_delete_own on public.wellness_logs
  for delete using (user_id = auth.uid());
