-- ============================================================================
--  Clean up `upgrade_intents` rows written to PAYING subscribers by the
--  load-order bug fixed on 2026-07-31.
--
--  ── WHAT HAPPENED ──────────────────────────────────────────────────────────
--  `usePlan()` FAILS CLOSED: while the `billing` query is in flight it returns
--  `isPro: false`, so for one round trip a paying subscriber is indistinguish-
--  able from a Free user. Six cap surfaces never read `billingLoading`, so on a
--  cold load a subscriber sitting at a Free limit was shown a Free-limit upsell
--  — and `CalendarSettings.addUrl()` went further and INSERTED an intent row
--  without any click on "Upgrade" at all.
--
--  `upgrade_intents` has an INSERT policy and deliberately NO select/update/
--  delete policy, so the client can neither read these back nor remove them.
--  This file must therefore be run from the Supabase SQL editor (service role).
--
--  ── EXPECTED RESULT TODAY: ZERO ROWS ───────────────────────────────────────
--  Run it anyway, but expect nothing. `resolveEffectivePlan` derives Pro from
--  three sources, and only ONE of them is asynchronous:
--    • the founding-email allowlist — synchronous, so founders were NEVER
--      affected;
--    • the dev-only localStorage override — synchronous, likewise never;
--    • the `billing` row — the async one, and the only one that can misread.
--  Billing is functionally off (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are
--  unset, see docs/LAUNCH_CHECKLIST.md §3.3), so there are no subscribers yet
--  and almost certainly no bogus rows. This would have started corrupting data
--  on the first paid day.
--
--  ── WHY IT IS SAFE ─────────────────────────────────────────────────────────
--  A Pro user's intent row is only bogus if it was recorded AFTER they were
--  already paying. An intent filed BEFORE they subscribed is exactly the signal
--  this table exists to capture, and deleting it would destroy real data. The
--  `billing` table has no subscription-start column — only `current_period_end`
--  — so the cut-off below uses the start of the CURRENT period, which is
--  strictly conservative: it can only ever spare a genuine pre-purchase row,
--  never delete one.
--
--  The six sources are exactly the surfaces that had the bug. `week_view` and
--  `history_cutoff` are deliberately EXCLUDED: WeekPage and useHistoryWindow
--  both folded `billingLoading` correctly and never misfired.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1 — REVIEW. Run this first and read the output. Delete nothing yet.
-- ---------------------------------------------------------------------------
select
  ui.id,
  ui.user_id,
  ui.email,
  ui.source,
  ui.created_at,
  b.plan,
  b.subscription_status,
  b.current_period_end
from public.upgrade_intents ui
join public.billing b on b.user_id = ui.user_id
where b.plan = 'pro'
  and b.subscription_status in ('active', 'trialing', 'past_due')
  and ui.source in (
    'calendar_live_sync',        -- CalendarSettings: written with NO user click
    'calendar_live_sync_link',   -- ...and the upsell link it then rendered
    'challenge_limit',
    'mindmap_limit',
    'vision_limit',
    'personal_templates_limit',
    'quit_habits_limit'
  )
  -- Only rows filed while the user was ALREADY paying. A monthly period is the
  -- conservative assumption: a yearly subscriber's older rows are spared.
  and ui.created_at >= (b.current_period_end - interval '1 month')
order by ui.created_at desc;

-- ---------------------------------------------------------------------------
-- STEP 2 — DELETE. Same predicate, verbatim. Run only after reviewing step 1.
-- ---------------------------------------------------------------------------
-- begin;
--
-- delete from public.upgrade_intents ui
-- using public.billing b
-- where b.user_id = ui.user_id
--   and b.plan = 'pro'
--   and b.subscription_status in ('active', 'trialing', 'past_due')
--   and ui.source in (
--     'calendar_live_sync',
--     'calendar_live_sync_link',
--     'challenge_limit',
--     'mindmap_limit',
--     'vision_limit',
--     'personal_templates_limit',
--     'quit_habits_limit'
--   )
--   and ui.created_at >= (b.current_period_end - interval '1 month');
--
-- -- Check the count matches step 1 before committing.
-- commit;

-- ---------------------------------------------------------------------------
-- NOT A MIGRATION. This file lives in docs/ on purpose: it is a one-off repair
-- run by hand against live data, not schema. Do NOT move it to
-- supabase/migrations/ — the cloud DB is fully migrated through
-- 20260731140000_journal_entries and `supabase db push` must not run.
-- ---------------------------------------------------------------------------
