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
--  `query_to_xml` is used ONCE (see below) and the only statement it executes is
--  a SELECT written out in full here. Running it twice changes nothing; running
--  it during traffic blocks nothing.
--
--  ── WHY `query_to_xml` IS USED AT ALL ─────────────────────────────────────
--
--  `public.checkout_attempts` is created by 20260801150000, which is one of the
--  four migrations deliberately NOT yet applied. A static reference to a table
--  that does not exist fails at PARSE time, so the whole query would error and
--  return nothing — including the billing half, which is the half that matters.
--  Guarding with `to_regclass` and running that one sub-select dynamically means
--  this file works BEFORE and AFTER those migrations land, which is exactly when
--  it needs to be run.
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
--    DELETE   — carries a Stripe id, so it is Sandbox-era subscription state.
--    PRESERVE — carries NO Stripe id, so it is a manual/founding grant. These
--               must survive; see docs/BILLING_SETUP.md §6, which grants
--               founding Pro with exactly such a row
--               (plan='pro', subscription_status='founding', no Stripe ids).
--
--  THAT DISTINCTION IS THE WHOLE POINT. "Delete every billing row" would be a
--  simpler policy and would silently revoke founding access.
-- ============================================================================

with

-- ── Which of the four pre-live migrations have landed? ──────────────────────
presence as (
  select
    to_regclass('public.billing')           is not null as billing_exists,
    to_regclass('public.checkout_attempts') is not null as attempts_exists,
    exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'billing'
         and column_name  = 'last_stripe_event_id'
    ) as billing_has_event_cols
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
    x.current_period_end,
    x.updated_at,
    (x.stripe_customer_id is not null or x.stripe_subscription_id is not null)
      as has_stripe_ids,
    exists (
      select 1
        from auth.users u
       where u.id = x.user_id
         and lower(u.email) in (select email from founding)
    ) as founding_account
  from public.billing x
),

-- One dynamic sub-select, guarded. Returns '[]' when the table is not there.
ca as (
  select case
           when (select attempts_exists from presence)
           then coalesce(
                  (xpath(
                    '/table/row/j/text()',
                    query_to_xml(
                      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) as j
                         from public.checkout_attempts t',
                      false, false, '')
                  ))[1]::text::jsonb,
                  '[]'::jsonb)
           else '[]'::jsonb
         end as rows
)

select section, item, value
from (

  -- ── A. SCHEMA ─────────────────────────────────────────────────────────────
  select 'A. schema'::text as section, 1 as ord,
         'public.billing exists'::text as item,
         to_jsonb(billing_exists) as value
    from presence
  union all
  select 'A. schema', 2,
         'public.checkout_attempts exists  (expected FALSE — 20260801150000 is unapplied)',
         to_jsonb(attempts_exists)
    from presence
  union all
  select 'A. schema', 3,
         'billing.last_stripe_event_* exist  (expected FALSE — 20260801140000 is unapplied)',
         to_jsonb(billing_has_event_cols)
    from presence

  -- ── B. BILLING COUNTS ─────────────────────────────────────────────────────
  union all
  select 'B. billing counts', 10, 'billing rows (total)',
         to_jsonb(count(*)) from b
  union all
  select 'B. billing counts', 11, 'IN CLEANUP SCOPE — rows carrying a Stripe id',
         to_jsonb(count(*) filter (where has_stripe_ids)) from b
  union all
  select 'B. billing counts', 12, 'PRESERVED — rows with NO Stripe id (manual / founding grants)',
         to_jsonb(count(*) filter (where not has_stripe_ids)) from b
  union all
  select 'B. billing counts', 13, 'distinct stripe_customer_id',
         to_jsonb(count(distinct stripe_customer_id)) from b
  union all
  select 'B. billing counts', 14, 'distinct stripe_subscription_id',
         to_jsonb(count(distinct stripe_subscription_id)) from b
  union all
  select 'B. billing counts', 15, 'rows belonging to a FOUNDING account',
         to_jsonb(count(*) filter (where founding_account)) from b
  union all
  select 'B. billing counts', 16, 'plan / status breakdown',
         coalesce(
           jsonb_agg(jsonb_build_object(
             'plan',                plan,
             'subscription_status', subscription_status,
             'has_stripe_ids',      has_stripe_ids,
             'rows',                n)),
           '[]'::jsonb)
    from (
      select plan, subscription_status, has_stripe_ids, count(*) as n
        from b group by 1, 2, 3
    ) g

  -- ── C. EVERY BILLING ROW, TAGGED ──────────────────────────────────────────
  union all
  select 'C. billing rows', 20,
         left(user_id::text, 8) || '…  ' ||
           case when has_stripe_ids then '[WOULD DELETE]' else '[PRESERVE]' end,
         jsonb_build_object(
           'user_id',                user_id,
           'plan',                   plan,
           'subscription_status',    subscription_status,
           'stripe_customer_id',     stripe_customer_id,
           'stripe_subscription_id', stripe_subscription_id,
           'current_period_end',     current_period_end,
           'updated_at',             updated_at,
           'founding_account',       founding_account,
           'action',                 case when has_stripe_ids then 'DELETE' else 'PRESERVE' end)
    from b

  -- ── D. CHECKOUT ATTEMPTS ──────────────────────────────────────────────────
  union all
  select 'D. checkout_attempts', 30, 'rows (total)',
         to_jsonb(jsonb_array_length(rows)) from ca
  union all
  select 'D. checkout_attempts', 31, 'NON-TERMINAL (reserved / session_created / completed)',
         to_jsonb(count(*))
    from ca, jsonb_array_elements(ca.rows) e
   where e ->> 'status' in ('reserved', 'session_created', 'completed')
  union all
  select 'D. checkout_attempts', 32, 'TERMINAL (consumed / expired / failed)',
         to_jsonb(count(*))
    from ca, jsonb_array_elements(ca.rows) e
   where e ->> 'status' in ('consumed', 'expired', 'failed')
  union all
  select 'D. checkout_attempts', 33, 'distinct stripe_session_id',
         to_jsonb(count(distinct e ->> 'stripe_session_id'))
    from ca, jsonb_array_elements(ca.rows) e
  union all
  select 'D. checkout_attempts', 34, 'all rows', rows from ca

  -- ── E. CROSS-CHECKS — read these before deleting anything ─────────────────
  union all
  select 'E. cross-checks', 40,
         'REVIEW — Pro with NO Stripe id (a manual/founding grant; WILL BE PRESERVED)',
         coalesce(
           jsonb_agg(jsonb_build_object(
             'user_id',             user_id,
             'subscription_status', subscription_status,
             'founding_account',    founding_account)),
           '[]'::jsonb)
    from b where plan = 'pro' and not has_stripe_ids
  union all
  select 'E. cross-checks', 41,
         'ANOMALY — the same stripe_subscription_id on more than one user',
         coalesce(
           jsonb_agg(jsonb_build_object('subscription', stripe_subscription_id, 'users', n)),
           '[]'::jsonb)
    from (
      select stripe_subscription_id, count(*) as n
        from b
       where stripe_subscription_id is not null
       group by 1
      having count(*) > 1
    ) d
  union all
  select 'E. cross-checks', 42,
         'FYI — founding accounts with NO billing row (they stay Pro via FOUNDING_EMAILS in code)',
         coalesce(jsonb_agg(left(u.id::text, 8) || '…'), '[]'::jsonb)
    from auth.users u
   where lower(u.email) in (select email from founding)
     and not exists (select 1 from public.billing bb where bb.user_id = u.id)

) q
order by ord, item;
