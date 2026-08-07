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
--  ── THE PRODUCTION SCHEMA IT IS WRITTEN AGAINST ───────────────────────────
--
--  `public.checkout_attempts` EXISTS in production (verified 2026-08-07 by a
--  read-only PostgREST probe: anon receives `42501 permission denied for table
--  checkout_attempts`, whereas a table that does not exist answers `404
--  PGRST205`). So it is referenced directly. An earlier revision of this file
--  routed that reference through `query_to_xml` because the table was believed
--  to be absent; that belief came from stale documentation, and the workaround
--  bought nothing but a query nobody could read. It is gone.
--
--  ── WHY EVERY BILLING COLUMN IS READ THROUGH `to_jsonb` ───────────────────
--
--  Whether `20260801140000_billing_event_ordering` has been applied — and so
--  whether `billing.last_stripe_event_id` / `last_stripe_event_at` exist — is
--  NOT visible to any read-only probe: the table-level grant is refused before
--  column resolution, so both a present and an absent column answer 42501.
--
--  Naming a column that does not exist fails at PARSE time and returns nothing
--  at all. `to_jsonb(x)` takes the row as it actually is, and `->>` on a key
--  that is not there yields NULL instead of an error. So this file is correct
--  whether or not that migration has landed, and section A REPORTS which case
--  you are in rather than assuming one.
--
--  ── WHAT IT DOES NOT SHOW, ON PURPOSE ─────────────────────────────────────
--
--  No email addresses and no display names. `user_id` is enough to act on a row
--  and to correlate it with Stripe, and a founding account is surfaced as a
--  BOOLEAN (`founding_account`) rather than by printing the address.
--
--  ── HOW TO READ THE RESULT ────────────────────────────────────────────────
--
--  Section C tags every billing row with `action`:
--
--    DELETE   — carries a Stripe id (customer, subscription, OR a last applied
--               Stripe event id), so it is Sandbox-era subscription state.
--    PRESERVE — carries none of those, so it is a manual/founding grant. These
--               must survive; see docs/BILLING_SETUP.md §6, which grants
--               founding Pro with exactly such a row
--               (plan='pro', subscription_status='founding', no Stripe ids).
--
--  THAT DISTINCTION IS THE WHOLE POINT. "Delete every billing row" would be a
--  simpler policy and would silently revoke founding access.
-- ============================================================================

with

-- ── What is actually deployed, rather than what a document claims ──────────
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

-- Read the row as it IS. See the header for why this is not a column list.
b as (
  select
    x.user_id,
    to_jsonb(x) as r,
    exists (
      select 1 from auth.users u
       where u.id = x.user_id
         and lower(u.email) in (select email from founding)
    ) as founding_account
  from public.billing x
),

bb as (
  select
    user_id,
    r,
    founding_account,
    r ->> 'plan'                   as plan,
    r ->> 'subscription_status'    as subscription_status,
    r ->> 'stripe_customer_id'     as customer_id,
    r ->> 'stripe_subscription_id' as subscription_id,
    r ->> 'last_stripe_event_id'   as last_event_id,
    (
      r ->> 'stripe_customer_id'     is not null or
      r ->> 'stripe_subscription_id' is not null or
      r ->> 'last_stripe_event_id'   is not null
    ) as stripe_touched
  from b
),

ca as (
  select t.id, t.user_id, to_jsonb(t) as r
    from public.checkout_attempts t
)

select section, item, value
from (

  -- ── A. WHAT IS DEPLOYED ───────────────────────────────────────────────────
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
  select 'B. billing counts', 10, 'billing rows (total)', to_jsonb(count(*)) from bb
  union all
  select 'B. billing counts', 11, 'IN CLEANUP SCOPE — rows carrying any Stripe id',
         to_jsonb(count(*) filter (where stripe_touched)) from bb
  union all
  select 'B. billing counts', 12, 'PRESERVED — rows with NO Stripe id (manual / founding grants)',
         to_jsonb(count(*) filter (where not stripe_touched)) from bb
  union all
  select 'B. billing counts', 13, 'distinct stripe_customer_id',
         to_jsonb(count(distinct customer_id)) from bb
  union all
  select 'B. billing counts', 14, 'distinct stripe_subscription_id',
         to_jsonb(count(distinct subscription_id)) from bb
  union all
  select 'B. billing counts', 15, 'rows carrying a last_stripe_event_id',
         to_jsonb(count(*) filter (where last_event_id is not null)) from bb
  union all
  select 'B. billing counts', 16, 'rows belonging to a FOUNDING account',
         to_jsonb(count(*) filter (where founding_account)) from bb
  union all
  select 'B. billing counts', 17, 'plan / status breakdown',
         coalesce(jsonb_agg(jsonb_build_object(
           'plan', plan, 'subscription_status', subscription_status,
           'stripe_touched', stripe_touched, 'rows', n)), '[]'::jsonb)
    from (
      select plan, subscription_status, stripe_touched, count(*) as n
        from bb group by 1, 2, 3
    ) g

  -- ── C. EVERY BILLING ROW, TAGGED ──────────────────────────────────────────
  union all
  select 'C. billing rows', 20,
         left(user_id::text, 8) || '…  ' ||
           case when stripe_touched then '[WOULD DELETE]' else '[PRESERVE]' end,
         r
           || jsonb_build_object('founding_account', founding_account)
           || jsonb_build_object('action', case when stripe_touched then 'DELETE' else 'PRESERVE' end)
    from bb

  -- ── D. CHECKOUT ATTEMPTS ──────────────────────────────────────────────────
  union all
  select 'D. checkout_attempts', 30, 'rows (total)', to_jsonb(count(*)) from ca
  union all
  select 'D. checkout_attempts', 31, 'NON-TERMINAL (reserved / session_created / completed)',
         to_jsonb(count(*) filter (
           where r ->> 'status' in ('reserved', 'session_created', 'completed'))) from ca
  union all
  select 'D. checkout_attempts', 32, 'TERMINAL (consumed / expired / failed)',
         to_jsonb(count(*) filter (
           where r ->> 'status' in ('consumed', 'expired', 'failed'))) from ca
  union all
  select 'D. checkout_attempts', 33, 'distinct stripe_session_id',
         to_jsonb(count(distinct r ->> 'stripe_session_id')) from ca
  union all
  select 'D. checkout_attempts', 34, 'all rows',
         coalesce((select jsonb_agg(r order by id) from ca), '[]'::jsonb)

  -- ── E. CROSS-CHECKS — read these before deleting anything ─────────────────
  union all
  select 'E. cross-checks', 40,
         'REVIEW — Pro with NO Stripe id (a manual/founding grant; WILL BE PRESERVED)',
         coalesce(jsonb_agg(jsonb_build_object(
           'user_id', user_id, 'subscription_status', subscription_status,
           'founding_account', founding_account)), '[]'::jsonb)
    from bb where plan = 'pro' and not stripe_touched
  union all
  select 'E. cross-checks', 41,
         'ANOMALY — the same stripe_subscription_id on more than one user',
         coalesce(jsonb_agg(jsonb_build_object('subscription', subscription_id, 'users', n)), '[]'::jsonb)
    from (
      select subscription_id, count(*) as n
        from bb where subscription_id is not null
       group by 1 having count(*) > 1
    ) d
  union all
  select 'E. cross-checks', 42,
         'ANOMALY — a checkout_attempts row whose user has no billing row',
         coalesce(jsonb_agg(distinct left(ca.user_id::text, 8) || '…'), '[]'::jsonb)
    from ca
   where not exists (select 1 from bb where bb.user_id = ca.user_id)
  union all
  select 'E. cross-checks', 43,
         'FYI — founding accounts with NO billing row (they stay Pro via FOUNDING_EMAILS in code)',
         coalesce(jsonb_agg(left(u.id::text, 8) || '…'), '[]'::jsonb)
    from auth.users u
   where lower(u.email) in (select email from founding)
     and not exists (select 1 from public.billing bb2 where bb2.user_id = u.id)

) q
order by ord, item;
