-- ============================================================================
--  Todonado — durable checkout attempts, authoritative purchase binding, and
--  subscription-scoped lifecycle resolution.
--
--  WHY THIS EXISTS
--
--  Three money-path defects survived the previous pass, and all three come from
--  the same root: the server had no durable record that IT had started a
--  purchase, so it had to trust things that are not proof.
--
--  1. DOUBLE SUBSCRIPTIONS. Checkout refused a second purchase by reading the
--     `billing` row, which only reflects reality AFTER a webhook lands. Two
--     requests on two Vercel instances both saw Free, both created a session,
--     and both could be paid. The Stripe idempotency key was derived from a
--     10-minute wall-clock bucket, so it collapsed nothing across a boundary
--     and nothing at all when one request chose monthly and the other yearly.
--
--  2. METADATA AS PROOF. The webhook granted Pro from `metadata.user_id` and a
--     `metadata.price_id` we stamped ourselves. That is proof of INTENT, not of
--     purchase. A Checkout Session created by hand in the Stripe Dashboard with
--     `metadata.user_id` set would have granted Pro to that user.
--
--  3. HBV CROSS-TALK. This Stripe account belongs to HBV Studio and holds other
--     products. Subscription lifecycle events resolved the user through
--     `metadata.user_id`, so any subscription carrying that key could move a
--     Todonado billing row.
--
--  The fix for all three is one idea: a SERVER-CREATED, UNGUESSABLE attempt row
--  that exists before Stripe is called, and which is the only root of identity.
--
--  WHAT THIS FILE DELIBERATELY DOES NOT DO
--
--  It does not modify 20260801140000_billing_event_ordering.sql. That file's
--  `apply_stripe_billing_event` remains the single implementation of the
--  ordering and downgrade rules, under `select … for update`; the functions
--  here CALL it rather than re-implementing any of it. A PL/pgSQL function body
--  runs inside the caller's transaction, so "consume the attempt and bind the
--  billing row" is one atomic unit.
-- ============================================================================

create table if not exists public.checkout_attempts (
  -- The durable attempt id. gen_random_uuid() is CSPRNG-backed, so this doubles
  -- as the unguessable token the webhook uses to locate the attempt. It is put
  -- in Stripe metadata; knowing it proves the session came from a checkout WE
  -- started, which `metadata.user_id` never did.
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users (id) on delete cascade,
  -- The price the FIRST reservation chose. A later request naming the other
  -- interval does not get its own attempt; the reserved plan wins until this
  -- attempt is terminal.
  price_id                text not null,
  status                  text not null default 'reserved'
    check (status in (
      -- non-terminal: block another attempt
      'reserved',          -- row exists, Stripe not called yet
      'session_created',   -- a Checkout Session exists and is open
      'completed',         -- session paid, webhook not yet processed
      -- terminal: a new attempt may be reserved
      'consumed',          -- verified and bound to billing
      'expired',           -- Stripe says the session expired
      'failed'             -- Stripe call failed; recoverable, never a permanent lock
    )),
  stripe_session_id       text,
  stripe_subscription_id  text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

/*
 * ONE NON-TERMINAL ATTEMPT PER USER, ENFORCED BY THE DATABASE.
 *
 * A partial unique index is the whole concurrency guarantee. Two inserts racing
 * from different Vercel instances cannot both succeed: Postgres serialises them
 * on the index and the loser gets a unique violation, which reserve_checkout_
 * attempt() turns into "return the winner's attempt". No application check can
 * offer that, because any check-then-insert has a gap in the middle.
 *
 * Terminal rows are excluded, so a user accumulates history without ever being
 * locked out.
 */
create unique index if not exists checkout_attempts_one_open_per_user
  on public.checkout_attempts (user_id)
  where status in ('reserved', 'session_created', 'completed');

create index if not exists checkout_attempts_user_id_idx
  on public.checkout_attempts (user_id);
create index if not exists checkout_attempts_session_idx
  on public.checkout_attempts (stripe_session_id);

drop trigger if exists set_updated_at on public.checkout_attempts;
create trigger set_updated_at before update on public.checkout_attempts
  for each row execute function public.set_updated_at();

/*
 * SERVER-ONLY. RLS is enabled and NO policy is created for anon or
 * authenticated — not even select. A client that could read this table could
 * read another user's Checkout Session id; a client that could write it could
 * forge an attempt and mint itself Pro. Every access is service-role, which
 * bypasses RLS, from api/. This mirrors `billing`, except `billing` at least
 * has a select-own policy and this has none.
 */
alter table public.checkout_attempts enable row level security;

revoke all on table public.checkout_attempts from anon, authenticated;

-- ============================================================================
--  RESERVE — atomic, cross-instance, and idempotent for the same user
-- ============================================================================
create or replace function public.reserve_checkout_attempt(
  p_user_id  uuid,
  p_price_id text
) returns public.checkout_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.checkout_attempts;
begin
  -- Fast path: this user already has a live attempt. Returned as-is, including
  -- its ORIGINAL price — a request for the other interval must not start a
  -- second purchase.
  select * into attempt
    from public.checkout_attempts
   where user_id = p_user_id
     and status in ('reserved', 'session_created', 'completed')
   for update;
  if found then
    return attempt;
  end if;

  begin
    insert into public.checkout_attempts (user_id, price_id, status)
    values (p_user_id, p_price_id, 'reserved')
    returning * into attempt;
  exception when unique_violation then
    -- Another instance inserted between our select and our insert. The index
    -- did its job; adopt the winner rather than failing the user.
    select * into attempt
      from public.checkout_attempts
     where user_id = p_user_id
       and status in ('reserved', 'session_created', 'completed')
     for update;
  end;

  return attempt;
end;
$$;

-- ============================================================================
--  ATTEMPT STATE TRANSITIONS — all server-side, all explicit
-- ============================================================================
create or replace function public.mark_checkout_attempt(
  p_attempt_id      uuid,
  p_status          text,
  p_session_id      text default null
) returns public.checkout_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.checkout_attempts;
begin
  update public.checkout_attempts
     set status            = p_status,
         -- Never unset a session id we already recorded: the recovery path
         -- depends on it surviving a crashed process.
         stripe_session_id = coalesce(p_session_id, stripe_session_id)
   where id = p_attempt_id
   returning * into attempt;
  return attempt;
end;
$$;

-- ============================================================================
--  BIND — consume the attempt and write billing, atomically
--
--  Called ONLY after api/stripe-webhook.ts has retrieved the Checkout Session
--  and the Subscription from Stripe and verified them. This function is the
--  last gate: it re-checks the attempt under a lock, so two webhook deliveries
--  or two different sessions cannot both bind.
-- ============================================================================
create or replace function public.bind_verified_checkout(
  p_attempt_id      uuid,
  p_event_id        text,
  p_event_at        timestamptz,
  p_customer_id     text,
  p_subscription_id text,
  p_price_id        text,
  p_status          text,
  p_period_end      timestamptz,
  -- The entitlement the CALLER derived from the subscription status it
  -- retrieved from Stripe. See the note above the call site below.
  p_plan            text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.checkout_attempts;
  outcome text;
begin
  select * into attempt
    from public.checkout_attempts
   where id = p_attempt_id
   for update;

  if not found then
    -- An attempt id we never issued. Fails closed: no grant.
    return 'unknown_attempt';
  end if;

  -- Already bound. A redelivery of the same event is handled downstream by the
  -- event-id rule; a DIFFERENT session quoting a consumed attempt is an attempt
  -- to bind twice and must be refused.
  if attempt.status = 'consumed' then
    if attempt.stripe_subscription_id is distinct from p_subscription_id then
      return 'attempt_already_consumed';
    end if;
    -- Same subscription re-presenting the same attempt: let the ordering rules
    -- below decide (they will report duplicate_event for a true redelivery).
  elsif attempt.status in ('expired', 'failed') then
    return 'attempt_not_open';
  end if;

  -- The purchase must match what the server reserved. A session that bought a
  -- different price than the attempt asked for is not this attempt's purchase.
  if attempt.price_id is distinct from p_price_id then
    return 'attempt_price_mismatch';
  end if;

  if p_plan not in ('free', 'pro') then
    raise exception 'bind_verified_checkout: invalid plan %', p_plan;
  end if;

  update public.checkout_attempts
     set status                 = 'consumed',
         stripe_subscription_id = p_subscription_id
   where id = p_attempt_id;

  -- The ordering and downgrade rules live in exactly one place:
  -- 20260801140000_billing_event_ordering.sql. This runs inside the same
  -- transaction, so consuming the attempt and writing billing are atomic.
  /*
   * ENTITLEMENT IS NOT IMPLIED BY A COMPLETED CHECKOUT.
   *
   * This used to pass a hard-coded 'pro'. That is wrong, and executing the
   * migration against a real database is what exposed it: a Session can be
   * `complete` while the Subscription it created is `incomplete` (SCA never
   * finished), `unpaid`, `paused`, or already `canceled` by the time the
   * webhook is processed. Binding is about IDENTITY — this attempt belongs to
   * this user and this subscription — and entitlement is a separate question
   * answered by the subscription's CURRENT status.
   *
   * The binding still happens in the non-entitled cases, deliberately: the
   * attempt is consumed so the user is not stuck, and the subscription id is
   * recorded so a later customer.subscription.updated can upgrade them without
   * a second checkout.
   */
  outcome := public.apply_stripe_billing_event(
    attempt.user_id,
    p_event_id,
    p_event_at,
    p_plan,
    p_customer_id,
    p_subscription_id,
    p_status,
    p_period_end,
    p_period_end is not null
  );

  return outcome;
end;
$$;

-- ============================================================================
--  LIFECYCLE — resolve the user by the SUBSCRIPTION WE VERIFIED, never metadata
--
--  HBV Studio runs other products in this Stripe account. `customer.subscription.*`
--  used to resolve the user through metadata.user_id, so any subscription
--  carrying that key could move a Todonado row. Identity now comes from the
--  subscription id that a verified Todonado checkout actually bound.
--
--  An event for a subscription we do not hold returns 'unknown_subscription'
--  and writes NOTHING — in particular it never creates a binding, because
--  binding is exclusively the job of bind_verified_checkout.
-- ============================================================================
create or replace function public.apply_stripe_subscription_event(
  p_subscription_id text,
  p_event_id        text,
  p_event_at        timestamptz,
  p_plan            text,
  p_customer_id     text,
  p_status          text,
  p_period_end      timestamptz,
  p_set_period_end  boolean
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
begin
  if p_subscription_id is null then
    return 'unknown_subscription';
  end if;

  select user_id into target_user
    from public.billing
   where stripe_subscription_id = p_subscription_id
   for update;

  if not found then
    return 'unknown_subscription';
  end if;

  return public.apply_stripe_billing_event(
    target_user,
    p_event_id,
    p_event_at,
    p_plan,
    p_customer_id,
    p_subscription_id,
    p_status,
    p_period_end,
    p_set_period_end
  );
end;
$$;

-- ============================================================================
--  PRIVILEGES — revoked from everyone, then granted to exactly one role
--
--  Two things were found by auditing the INSTALLED privileges rather than the
--  text of the migration, which is the only way either would have surfaced:
--
--  1. `revoke … from public, anon, authenticated` says nothing about
--     service_role, so the webhook's access was arriving purely from Supabase's
--     ALTER DEFAULT PRIVILEGES on the public schema. It worked, but it was
--     incidental: a change to those defaults, or a function created by another
--     role, would have removed the money path's database access with no code
--     change. The grants below make it intentional.
--
--  2. service_role also held SELECT/INSERT/UPDATE/DELETE on checkout_attempts
--     from the same defaults. Nothing needs it — every access goes through the
--     SECURITY DEFINER functions, which run as the table owner. Direct table
--     privileges are removed so the functions really are the only path.
--
--  PUBLIC is revoked explicitly because PostgreSQL grants EXECUTE on a new
--  function to PUBLIC by default. Revoking only anon and authenticated would
--  leave every one of these callable by anybody.
-- ============================================================================

revoke all on table public.checkout_attempts from service_role;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.reserve_checkout_attempt(uuid, text)',
    'public.mark_checkout_attempt(uuid, text, text)',
    'public.bind_verified_checkout(uuid, text, timestamptz, text, text, text, text, timestamptz, text)',
    'public.apply_stripe_subscription_event(text, text, timestamptz, text, text, text, timestamptz, boolean)',
    -- Declared here rather than in 20260801140000 so that file stays exactly as
    -- reviewed. Same reasoning applies to it.
    'public.apply_stripe_billing_event(uuid, text, timestamptz, text, text, text, text, timestamptz, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$$;
