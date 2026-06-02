-- ============================================================================
--  Todonado — fractional ordering positions
--  Switch position columns to double precision so a reorder can drop an item
--  at the midpoint between its neighbours (single-row update, no global
--  renumbering that would reshuffle sibling views). Idempotent / additive.
-- ============================================================================

alter table public.tasks    alter column position type double precision;
alter table public.sections alter column position type double precision;
alter table public.subtasks alter column position type double precision;
