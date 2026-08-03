-- ============================================================================
--  Todonado — webhook ordering + de-duplication for billing (audit FLAG-3)
--
--  THE BUG THIS CLOSES NEEDS NO ATTACKER.
--
--  Stripe retries webhook deliveries, and retries arrive out of order. Today
--  api/stripe-webhook.ts does a blind `upsert` keyed on user_id: whatever
--  arrives LAST wins. So a redelivered `customer.subscription.deleted` landing
--  after a newer `checkout.session.completed` silently downgrades a paying
--  customer to Free. The audit rates it Medium only because nothing can be
--  bought yet; the moment live keys are set it is a revenue-and-trust bug that
--  fires on Stripe's own retry behaviour.
--
--  WHY TWO COLUMNS AND NOT A PROCESSED-EVENTS TABLE
--
--  The obvious fix is a `stripe_events` table keyed on event id, inserted
--  before the write so a duplicate raises 23505. That is a second table, a
--  second write per event, and a second thing to keep consistent with the row
--  it guards — for state that is already one row per user. Two columns on
--  `billing` give the same two guarantees from the SAME row the write targets:
--
--    last_stripe_event_id  exact de-duplication of a redelivered event
--    last_stripe_event_at  a monotonic high-water mark, so an event older than
--                          what we already applied is dropped
--
--  Because both live on the row being written, the guard and the write are one
--  statement and cannot disagree. A separate table would also need its own
--  retention policy; this needs none.
--
--  ORDERING IS BY STRIPE'S CLOCK, NEVER OURS. `last_stripe_event_at` stores
--  `event.created` from the verified event payload — not the time the request
--  reached us. Arrival time is exactly the thing that is wrong in the bug.
--
--  BOTH COLUMNS ARE NULLABLE, AND THAT IS SAFE. Adding a nullable column with
--  no default is a catalog-only change: no table rewrite, no validation pass
--  over existing rows, so — unlike a CHECK constraint — this migration cannot
--  fail on data already present. Existing billing rows start with a NULL mark
--  and pick one up on the first event after this runs.
--
--  KNOWN, DELIBERATE GAP: for a row whose mark is still NULL there is no
--  history to order against, so the very first event after this migration is
--  applied on trust. The subscription-id guard in webhookOrdering.ts still
--  covers the dangerous case (a delete naming a subscription we no longer
--  hold). This window closes the first time each row is written.
-- ============================================================================

alter table public.billing
  add column if not exists last_stripe_event_id text,
  add column if not exists last_stripe_event_at timestamptz;

comment on column public.billing.last_stripe_event_id is
  'Stripe event.id of the last webhook event applied to this row. A redelivery '
  'of the same id is a no-op. See api/stripe-webhook.ts and audit FLAG-3.';

comment on column public.billing.last_stripe_event_at is
  'Stripe event.created of the last webhook event applied to this row — Stripe''s '
  'clock, never arrival time. An event older than this is dropped so a retried, '
  'out-of-order subscription.deleted cannot downgrade a paying customer.';

-- ============================================================================
--  THE DECISION MUST HAPPEN INSIDE ONE LOCKED STATEMENT
--
--  The first version of this fix read the row, decided in JavaScript, then
--  wrote with a compare-and-swap on the timestamp. That is three steps with two
--  gaps, and Stripe delivers concurrently to as many Vercel instances as happen
--  to be warm. The timestamp CAS did hold the ORDERING, but the downgrade
--  guards did not, because they are derived from the row as READ:
--
--    row: plan='free', subscription='sub_old'
--    A = checkout.session.completed  sub_new  t1   (the customer pays)
--    B = customer.subscription.deleted sub_old t2   (the lapsed one cancels)
--
--  Both instances read plan='free', so B never classifies itself as a
--  downgrade and its "must name the subscription we hold" guard is skipped
--  entirely. B is genuinely newer, so the timestamp CAS lets it through, and
--  the customer is downgraded seconds after paying. Reproduced in
--  api/stripeWebhookConcurrency.test.ts before this function existed.
--
--  `select … for update` serialises concurrent callers on the row itself, so
--  every rule below is evaluated against live state, not a snapshot.
-- ============================================================================

create or replace function public.apply_stripe_billing_event(
  p_user_id          uuid,
  p_event_id         text,
  p_event_at         timestamptz,
  p_plan             text,
  p_customer_id      text,
  p_subscription_id  text,
  p_status           text,
  p_period_end       timestamptz,
  -- checkout.session.completed carries no period end; without this flag a NULL
  -- would erase a value customer.subscription.updated had already written.
  p_set_period_end   boolean
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cur          public.billing%rowtype;
  is_downgrade boolean;
begin
  if p_plan not in ('free', 'pro') then
    raise exception 'apply_stripe_billing_event: invalid plan %', p_plan;
  end if;

  select * into cur from public.billing where user_id = p_user_id for update;

  if not found then
    insert into public.billing (
      user_id, plan, stripe_customer_id, stripe_subscription_id,
      subscription_status, current_period_end,
      last_stripe_event_id, last_stripe_event_at
    ) values (
      p_user_id, p_plan, p_customer_id, p_subscription_id,
      p_status, case when p_set_period_end then p_period_end else null end,
      p_event_id, p_event_at
    )
    on conflict (user_id) do nothing;

    if found then
      return 'applied';
    end if;

    -- Another caller inserted between our select and our insert. Re-read under
    -- the lock and fall through to the ordinary rules.
    select * into cur from public.billing where user_id = p_user_id for update;
  end if;

  -- 1. Exact redelivery of an event already applied.
  if cur.last_stripe_event_id is not distinct from p_event_id then
    return 'duplicate_event';
  end if;

  -- 2. Older than the high-water mark, whatever it would do.
  if cur.last_stripe_event_at is not null and p_event_at < cur.last_stripe_event_at then
    return 'stale_event';
  end if;

  -- 3. Downgrades face a stricter test. Granting Pro wrongly for a few minutes
  --    is a rounding error; revoking it from someone who is paying is the bug.
  is_downgrade := (p_plan = 'free' and cur.plan = 'pro');
  if is_downgrade then
    -- event.created has SECOND precision, so a cancel and the renewal that
    -- superseded it can tie. A tie is not good enough to revoke access.
    if cur.last_stripe_event_at is not null and p_event_at <= cur.last_stripe_event_at then
      return 'stale_downgrade';
    end if;
    -- Cancel-then-resubscribe produces a NEW subscription id. The old one's
    -- delete is legitimate for that object and says nothing about the one now
    -- paying. Clock-independent, so it holds even when the mark is NULL.
    if cur.stripe_subscription_id is not null
       and p_subscription_id is not null
       and cur.stripe_subscription_id <> p_subscription_id then
      return 'downgrade_for_other_subscription';
    end if;
  end if;

  update public.billing set
    plan                   = p_plan,
    stripe_customer_id     = coalesce(p_customer_id, stripe_customer_id),
    stripe_subscription_id = coalesce(p_subscription_id, stripe_subscription_id),
    subscription_status    = p_status,
    current_period_end     = case when p_set_period_end
                                  then p_period_end
                                  else current_period_end end,
    last_stripe_event_id   = p_event_id,
    last_stripe_event_at   = p_event_at
  where user_id = p_user_id;

  return 'applied';
end;
$$;

-- The webhook calls this with the SERVICE-ROLE key, which bypasses RLS anyway.
-- Revoking the default public grant keeps it off the anon/authenticated API
-- surface, so no client can drive it directly.
revoke all on function public.apply_stripe_billing_event(
  uuid, text, timestamptz, text, text, text, text, timestamptz, boolean
) from public, anon, authenticated;
