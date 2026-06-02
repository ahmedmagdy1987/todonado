-- ============================================================================
--  Todonado — recurring tasks
--  Additive recurrence columns on tasks. recurrence_freq IS NULL = one-off task.
--  RLS is unchanged (same table). Idempotent.
-- ============================================================================

alter table public.tasks
  add column if not exists recurrence_freq text
    check (recurrence_freq in ('daily', 'weekly', 'monthly', 'yearly')),
  add column if not exists recurrence_interval integer not null default 1
    check (recurrence_interval >= 1),
  add column if not exists recurrence_weekdays integer[],
  add column if not exists recurrence_until date;

comment on column public.tasks.recurrence_freq is
  'Repeat cadence; NULL = one-off task. Completing a recurring task spawns the next occurrence.';
comment on column public.tasks.recurrence_weekdays is
  'Weekly recurrence: weekday numbers 0–6 (Sun–Sat).';
