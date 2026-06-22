-- ============================================================================
--  Todonado — analytics & demand dashboard (run in the Supabase SQL editor)
--
--  These read the INSERT-ONLY tables that the client cannot read back:
--    - feature_intents  (fake-door interest in unbuilt concepts)
--    - upgrade_intents  (willingness-to-pay)
--    - events           (first-party behavioral events; migration 20260623120000)
--
--  The SQL editor runs as a privileged role, so it bypasses the RLS write-only
--  policies. Nothing here changes data — pure SELECTs. Run any block on its own.
-- ============================================================================


-- ── 1. Demand: feature_intents (interest per unbuilt concept) ───────────────
select
  feature_key,
  count(*)                       as clicks,
  count(distinct user_id)        as unique_users,
  count(*) filter (where user_id is null) as anon_clicks,
  min(created_at)                as first_seen,
  max(created_at)                as last_seen
from public.feature_intents
group by feature_key
order by clicks desc;


-- ── 2. Demand: upgrade_intents (willingness-to-pay per tier) ────────────────
select
  tier,
  count(*)                        as clicks,
  count(distinct user_id)         as unique_users,
  count(*) filter (where email is not null) as left_email,
  min(created_at)                 as first_seen,
  max(created_at)                 as last_seen
from public.upgrade_intents
group by tier
order by clicks desc;


-- ── 3. Behavior: events by type (volume, reach, recency) ────────────────────
select
  event,
  count(*)                        as total,
  count(distinct user_id)         as unique_users,
  min(created_at)                 as first_seen,
  max(created_at)                 as last_seen
from public.events
group by event
order by total desc;


-- ── 4. The wedge's key signal: do people enter effort when creating tasks? ──
--  flag = has_effort on 'task_created'. This % is the single most important
--  number for whether the capacity meter actually gets fed.
select
  count(*)                                          as tasks_created,
  count(*) filter (where flag is true)              as with_effort,
  round(
    100.0 * count(*) filter (where flag is true) / nullif(count(*), 0), 1
  )                                                 as pct_with_effort,
  count(distinct user_id)                           as creators
from public.events
where event = 'task_created';


-- ── 5. Retention: day_returned per calendar day (returning users) ───────────
select
  created_at::date                as day,
  count(*)                        as returns,
  count(distinct user_id)         as unique_returning_users
from public.events
where event = 'day_returned'
group by day
order by day desc
limit 30;


-- ── 6. Activation funnel snapshot (unique users reaching each step) ─────────
--  A coarse funnel: returned -> created a task -> entered effort -> hit the
--  capacity wall -> completed a task -> completed a focus session.
select
  count(distinct user_id) filter (where event = 'day_returned')      as returned,
  count(distinct user_id) filter (where event = 'task_created')      as created_task,
  count(distinct user_id) filter (where event = 'effort_entered')    as entered_effort,
  count(distinct user_id) filter (where event = 'over_capacity_hit') as hit_capacity,
  count(distinct user_id) filter (where event = 'task_completed')    as completed_task,
  count(distinct user_id) filter (where event = 'focus_completed')   as completed_focus
from public.events
where user_id is not null;
