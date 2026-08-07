-- ============================================================================
--  TODONADO — ISSUE #8
--  READ-ONLY INVENTORY of Stripe TEST/Sandbox billing state, before Live.
--
--  RUN THIS IN THE SUPABASE SQL EDITOR. Paste the whole file; it is ONE
--  statement and returns one result set.
--
--  ── WHY IT IS SAFE ────────────────────────────────────────────────────────
--
--  It is a single SELECT. There is no INSERT, UPDATE, DELETE, TRUNCATE, DROP,
--  ALTER, COPY or GRANT anywhere in it, and it calls no function that writes.
--  Running it twice changes nothing; running it during traffic blocks nothing.
--
--  ── THE SCHEMA IT IS WRITTEN AGAINST — VERIFIED, NOT ASSUMED ──────────────
--
--  All four pre-live migrations are APPLIED in production (owner-run
--  reconciliation query, 2026-08-07: `schema_migrations` carries 20260801140000,
--  20260801150000, 20260801160000 and 20260801170000; latest = 20260801170000).
--  So `public.checkout_attempts` exists, and so do
--  `billing.last_stripe_event_id` / `last_stripe_event_at`.
--
--  Every column is therefore named DIRECTLY. Two earlier revisions of this file
--  worked around a schema that was believed — wrongly, from a stale document —
--  to be missing those objects: first `query_to_xml`, then `to_jsonb(x) ->>`.
--  Both are gone. A query that gates a destructive operation has to be readable,
--  and neither workaround bought anything once the schema was actually checked.
--
--  Section A re-checks all of it AT RUN TIME anyway, and is the first thing
--  returned. If section A ever disagrees with this header, SECTION A WINS.
--
--  ── WHAT IT DOES NOT SHOW, ON PURPOSE ─────────────────────────────────────
--
--  No email addresses and no display names. `user_id` is enough to act on a row
--  and to correlate it with Stripe, and a founding account is surfaced as a
--  BOOLEAN (`founding_account`) rather than by printing the address.
--
--  ── HOW TO READ THE RESULT ────────────────────────────────────────────────
--
--  Sections C and D tag every row with `action`:
--
--    DELETE   — carries a Stripe identifier (customer, subscription, session, or
--               a last-applied Stripe event id), so it is Sandbox-era state.
--    PRESERVE — carries none of those, so it is a manual/founding grant. These
--               must survive; see docs/BILLING_SETUP.md §6, which grants
--               founding Pro with exactly such a row
--               (plan='pro', subscription_status='founding', no Stripe ids).
--
--  THAT DISTINCTION IS THE WHOLE POINT. "Delete every billing row" would be a
--  simpler policy and would silently revoke founding access.
-- ============================================================================

with

-- ── Re-verify the deployed schema at run time ──────────────────────────────
presence as (
  select
    current_database()                                        as db_name,
    to_regclass('public.billing')           is not null       as billing_exists,
    to_regclass('public.checkout_attempts') is not null       as attempts_exists,
    exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'billing'
         and column_name  = 'last_stripe_event_id'
    ) as has_event_id_col,
    exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'billing'
         and column_name  = 'last_stripe_event_at'
    ) as has_event_at_col
),

-- The founding allow-list, mirrored from src/features/billing/planCore.ts.
-- Used ONLY to flag a row, never to print the address.
founding (email) as (
  values ('journeypixofficial@gmail.com'),
         ('ahmedkassim17777@gmail.com')
),

b as (
  select
    x.user_id,
    x.plan,
    x.subscription_status,
    x.stripe_customer_id,
    x.stripe_subscription_id,
    x.last_stripe_event_id,
    x.last_stripe_event_at,
    x.current_period_end,
    x.updated_at,
    (
      x.stripe_customer_id     is not null or
      x.stripe_subscription_id is not null or
      x.last_stripe_event_id   is not null
    ) as stripe_touched,
    exists (
      select 1 from auth.users u
       where u.id = x.user_id
         and lower(u.email) in (select email from founding)
    ) as founding_account
  from public.billing x
),

-- Every checkout attempt carries a Stripe session or subscription id, or is an
-- unconsummated reservation from the Sandbox era. Both are test-mode state.
ca as (
  select
    t.id,
    t.user_id,
    t.price_id,
    t.status,
    t.stripe_session_id,
    t.stripe_subscription_id,
    t.created_at,
    t.updated_at,
    (t.status in ('reserved', 'session_created', 'completed')) as non_terminal
  from public.checkout_attempts t
)

select section, item, value
from (

  -- ── A. DEPLOYED SCHEMA — re-checked now, not taken from any document ──────
  select 'A. deployed schema'::text as section, 1 as ord,
         'current_database()'::text as item, to_jsonb(db_name) as value
    from presence
  union all
  select 'A. deployed schema', 2, 'public.billing exists', to_jsonb(billing_exists) from presence
  union all
  select 'A. deployed schema', 3, 'public.checkout_attempts exists  (20260801150000)',
         to_jsonb(attempts_exists) from presence
  union all
  select 'A. deployed schema', 4, 'billing.last_stripe_event_id exists  (20260801140000)',
         to_jsonb(has_event_id_col) from presence
  union all
  select 'A. deployed schema', 5, 'billing.last_stripe_event_at exists  (20260801140000)',
         to_jsonb(has_event_at_col) from presence
  union all
  select 'A. deployed schema', 6, 'pre-live migrations recorded in schema_migrations',
         coalesce(jsonb_agg(version order by version), '[]'::jsonb)
    from supabase_migrations.schema_migrations
   where version in ('20260801140000', '20260801150000', '20260801160000', '20260801170000')
  union all
  select 'A. deployed schema', 7, 'latest migration recorded',
         to_jsonb(max(version)) from supabase_migrations.schema_migrations

  -- ── B. BILLING COUNTS ─────────────────────────────────────────────────────
  union all
  select 'B. billing counts', 10, 'billing rows (total)', to_jsonb(count(*)) from b
  union all
  select 'B. billing counts', 11, 'IN CLEANUP SCOPE — rows carrying any Stripe identifier',
         to_jsonb(count(*) filter (where stripe_touched)) from b
  union all
  select 'B. billing counts', 12, 'PRESERVED — rows with NO Stripe identifier (manual / founding)',
         to_jsonb(count(*) filter (where not stripe_touched)) from b
  union all
  select 'B. billing counts', 13, 'distinct stripe_customer_id',
         to_jsonb(count(distinct stripe_customer_id)) from b
  union all
  select 'B. billing counts', 14, 'distinct stripe_subscription_id',
         to_jsonb(count(distinct stripe_subscription_id)) from b
  union all
  select 'B. billing counts', 15, 'rows carrying a last_stripe_event_id',
         to_jsonb(count(*) filter (where last_stripe_event_id is not null)) from b
  union all
  select 'B. billing counts', 16, 'rows belonging to a FOUNDING account',
         to_jsonb(count(*) filter (where founding_account)) from b
  union all
  select 'B. billing counts', 17, 'plan / status breakdown',
         coalesce(jsonb_agg(jsonb_build_object(
           'plan', plan, 'subscription_status', subscription_status,
           'stripe_touched', stripe_touched, 'rows', n)), '[]'::jsonb)
    from (
      select plan, subscription_status, stripe_touched, count(*) as n
        from b group by 1, 2, 3
    ) g

  -- ── C. EVERY BILLING ROW, TAGGED ──────────────────────────────────────────
  union all
  select 'C. billing rows', 20,
         left(user_id::text, 8) || '…  ' ||
           case when stripe_touched then '[WOULD DELETE]' else '[PRESERVE]' end,
         jsonb_build_object(
           'user_id',                user_id,
           'plan',                   plan,
           'subscription_status',    subscription_status,
           'stripe_customer_id',     stripe_customer_id,
           'stripe_subscription_id', stripe_subscription_id,
           'last_stripe_event_id',   last_stripe_event_id,
           'last_stripe_event_at',   last_stripe_event_at,
           'current_period_end',     current_period_end,
           'updated_at',             updated_at,
           'founding_account',       founding_account,
           'action',                 case when stripe_touched then 'DELETE' else 'PRESERVE' end)
    from b

  -- ── D. CHECKOUT ATTEMPTS ──────────────────────────────────────────────────
  union all
  select 'D. checkout_attempts', 30, 'rows (total)', to_jsonb(count(*)) from ca
  union all
  select 'D. checkout_attempts', 31, 'NON-TERMINAL (reserved / session_created / completed)',
         to_jsonb(count(*) filter (where non_terminal)) from ca
  union all
  select 'D. checkout_attempts', 32, 'TERMINAL (consumed / expired / failed)',
         to_jsonb(count(*) filter (where not non_terminal)) from ca
  union all
  select 'D. checkout_attempts', 33, 'distinct stripe_session_id',
         to_jsonb(count(distinct stripe_session_id)) from ca
  union all
  select 'D. checkout_attempts', 34, 'distinct stripe_subscription_id',
         to_jsonb(count(distinct stripe_subscription_id)) from ca
  union all
  select 'D. checkout_attempts', 35, 'status breakdown',
         coalesce(jsonb_agg(jsonb_build_object('status', status, 'rows', n)), '[]'::jsonb)
    from (select status, count(*) as n from ca group by 1) s
  union all
  select 'D. checkout_attempts', 36,
         left(user_id::text, 8) || '…  attempt ' || left(id::text, 8) || '…  [WOULD DELETE]',
         jsonb_build_object(
           'id',                     id,
           'user_id',                user_id,
           'price_id',               price_id,
           'status',                 status,
           'non_terminal',           non_terminal,
           'stripe_session_id',      stripe_session_id,
           'stripe_subscription_id', stripe_subscription_id,
           'created_at',             created_at,
           'updated_at',             updated_at,
           'action',                 'DELETE')
    from ca

  -- ── E. CROSS-CHECKS — read these before deleting anything ─────────────────
  union all
  select 'E. cross-checks', 40,
         'REVIEW — Pro with NO Stripe identifier (manual/founding grant; WILL BE PRESERVED)',
         coalesce(jsonb_agg(jsonb_build_object(
           'user_id', user_id, 'subscription_status', subscription_status,
           'founding_account', founding_account)), '[]'::jsonb)
    from b where plan = 'pro' and not stripe_touched
  union all
  select 'E. cross-checks', 41,
         'ANOMALY — the same stripe_subscription_id on more than one billing row',
         coalesce(jsonb_agg(jsonb_build_object('subscription', stripe_subscription_id, 'rows', n)),
                  '[]'::jsonb)
    from (
      select stripe_subscription_id, count(*) as n
        from b where stripe_subscription_id is not null
       group by 1 having count(*) > 1
    ) d1
  union all
  select 'E. cross-checks', 42,
         'ANOMALY — the same stripe_session_id on more than one checkout attempt',
         coalesce(jsonb_agg(jsonb_build_object('session', stripe_session_id, 'rows', n)),
                  '[]'::jsonb)
    from (
      select stripe_session_id, count(*) as n
        from ca where stripe_session_id is not null
       group by 1 having count(*) > 1
    ) d2
  union all
  select 'E. cross-checks', 43,
         'ANOMALY — more than one NON-TERMINAL attempt for a user (the partial unique index should make this impossible)',
         coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'open_attempts', n)), '[]'::jsonb)
    from (
      select user_id, count(*) as n
        from ca where non_terminal
       group by 1 having count(*) > 1
    ) d3
  union all
  select 'E. cross-checks', 44,
         'ANOMALY — a checkout attempt whose user has no billing row',
         coalesce(jsonb_agg(distinct left(ca.user_id::text, 8) || '…'), '[]'::jsonb)
    from ca
   where not exists (select 1 from b where b.user_id = ca.user_id)
  union all
  select 'E. cross-checks', 45,
         'ANOMALY — plan/status disagreement (pro without active, or free still holding a subscription)',
         coalesce(jsonb_agg(jsonb_build_object(
           'user_id', user_id, 'plan', plan, 'subscription_status', subscription_status,
           'has_subscription', stripe_subscription_id is not null,
           'current_period_end', current_period_end)), '[]'::jsonb)
    from b
   where (plan = 'pro'  and subscription_status is distinct from 'active')
      or (plan = 'free' and stripe_subscription_id is not null)
  union all
  select 'E. cross-checks', 46,
         'FYI — founding accounts with NO billing row (they stay Pro via FOUNDING_EMAILS in code)',
         coalesce(jsonb_agg(left(u.id::text, 8) || '…'), '[]'::jsonb)
    from auth.users u
   where lower(u.email) in (select email from founding)
     and not exists (select 1 from public.billing b2 where b2.user_id = u.id)

) q
order by ord, item;
