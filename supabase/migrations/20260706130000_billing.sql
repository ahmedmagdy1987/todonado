-- ============================================================================
--  Todonado — billing (Stripe subscription state)
--
--  Holds each user's subscription state. The plan gate ('free' | 'pro') lives
--  HERE, not on profiles, ON PURPOSE:
--
--    profiles has a self-UPDATE RLS policy (a user edits their own name/etc.), so
--    putting `plan` there would let any user forge plan='pro' with a single
--    PATCH. Instead, `billing` has ONLY a SELECT-own policy and NO
--    insert/update/delete policy for anon or authenticated — so the client can
--    read its own plan but can NEVER write it. Every write comes from the Stripe
--    webhook (api/stripe-webhook) using the SERVICE-ROLE key, which bypasses RLS.
--    Result: a user can never self-upgrade.
-- ============================================================================

create table if not exists public.billing (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  plan                    text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  subscription_status     text,
  current_period_end      timestamptz,
  updated_at              timestamptz not null default now()
);

-- Webhook subscription events resolve the user by metadata.user_id, but this
-- index keeps any customer-id lookups fast.
create index if not exists billing_stripe_customer_id_idx on public.billing (stripe_customer_id);

-- updated_at trigger (reuses the shared function from the initial schema).
drop trigger if exists set_updated_at on public.billing;
create trigger set_updated_at before update on public.billing
  for each row execute function public.set_updated_at();

alter table public.billing enable row level security;

-- SELECT own row ONLY. Deliberately NO insert/update/delete policy for anon or
-- authenticated: all writes are server-side via the service-role webhook.
drop policy if exists billing_select_own on public.billing;
create policy billing_select_own on public.billing
  for select using (user_id = auth.uid());
