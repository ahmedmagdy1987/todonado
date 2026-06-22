-- ============================================================================
--  Todonado — extend events with the 'auto_planned' marker (Phase 3B)
--
--  Adds 'auto_planned' to the events CHECK so the auto-plan-my-day action can
--  record an adoption signal. Insert-only RLS is UNCHANGED (no policy touched) —
--  this only widens the allowed event names. Requires 20260623120000_events.
--
--  Idempotent: drops the existing check (default name events_event_check) and
--  re-adds it with the wider list; safe to re-run.
-- ============================================================================

alter table public.events drop constraint if exists events_event_check;

alter table public.events
  add constraint events_event_check check (event in (
    'task_created', 'effort_entered', 'template_applied', 'capacity_viewed',
    'over_capacity_hit', 'task_completed', 'focus_completed', 'day_returned',
    'auto_planned'
  ));
