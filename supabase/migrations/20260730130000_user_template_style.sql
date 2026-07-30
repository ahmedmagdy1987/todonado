-- ============================================================================
--  Todonado — user_templates.style (the checklist style for personal templates)
--
--  A personal template can now be one of two things:
--    'plan'      — a set of tasks you schedule into a day. What every personal
--                  template was before this column existed.
--    'checklist' — a repeated-use list you tick through (a gym split, a packing
--                  list, a weekly shutdown). It applies WITHOUT dates, so the
--                  dated "Today" target is not offered for it.
--
--  NULLABLE, AND NULL MEANS 'plan'. That is the whole reason there is no
--  backfill and no default: every row written before this column existed stays
--  valid and keeps behaving exactly as it did. The client narrows the value with
--  `toTemplateStyle()`, which reads anything unrecognised — including null, and
--  including a value from some future build — as 'plan', so an unknown value can
--  never make somebody's saved template unusable.
--
--  WHY A COLUMN AND NOT THE jsonb. `tasks` is CHECK-constrained to
--  `jsonb_typeof(tasks) = 'array'`, so a template-level flag cannot be wrapped
--  around it without dropping a constraint that is already applied and already
--  pinned by personalCaps.test.ts. Smuggling the flag onto every task ENTRY
--  would pass the database but is conceptually wrong (it is a property of the
--  template, not of a task), cannot represent an empty template, and desyncs the
--  moment one task is edited.
--
--  DEPLOY ORDER IS SAFE IN BOTH DIRECTIONS. The client only ever NAMES this
--  column when a checklist is actually being saved, and treats a
--  missing-column error (PGRST204 / 42703) as "save it as a plan and say so"
--  rather than failing the write. So the app works before this migration is
--  applied, and works after — no coordinated release.
--
--  No RLS change: `style` is just another column on an already owner-only table
--  (user_id = auth.uid() on all four actions). Idempotent — safe to re-run.
-- ============================================================================

alter table public.user_templates
  add column if not exists style text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_templates_style_valid') then
    alter table public.user_templates
      add constraint user_templates_style_valid
      check (style is null or style in ('plan', 'checklist'));
  end if;
end $$;

comment on column public.user_templates.style is
  'How the template is used: ''checklist'' applies without dates; NULL or ''plan'' is the original dated behaviour.';
