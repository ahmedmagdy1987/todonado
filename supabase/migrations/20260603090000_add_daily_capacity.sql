-- ============================================================================
--  Todonado — daily capacity setting
--  Per-user daily capacity (minutes) powering the Today capacity meter.
--  Additive & idempotent.
-- ============================================================================

alter table public.profiles
  add column if not exists daily_capacity_minutes integer not null default 360
    check (daily_capacity_minutes > 0);

comment on column public.profiles.daily_capacity_minutes is
  'User''s planning capacity per day, in minutes. Default 360 (6h). Drives the Today capacity meter / overbooking guard.';
