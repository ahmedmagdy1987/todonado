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
