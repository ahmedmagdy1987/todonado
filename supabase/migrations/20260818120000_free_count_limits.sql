-- ============================================================================
--  Option B server-side enforcement of the Free count limits.
--
--  PROMOTED FROM docs/proposals/ ON 2026-08-18, once both prerequisites that
--  kept it out of this folder were actually met:
--
--    1. THE DATABASE CAN NOW TELL WHO IS PRO. `public.billing` was EMPTY in
--       production (16 users, 0 rows), so the only thing making anyone Pro was
--       a TypeScript email allowlist this trigger cannot see, and applying it
--       would have capped the owner's own founding account at the Free limits.
--       The reviewed founding seed has since been executed: exactly one row,
--       plan='pro', subscription_status='founding', both Stripe ids NULL.
--    2. IT HAS BEEN EXECUTED. The whole migration chain plus this file were
--       applied from empty to a disposable PostgreSQL 17.6 and exercised by
--       `db-tests/entitlementLimits.db.test.ts`: the caps on all four tables for
--       Free, Pro and Founding Pro; grandfathering (an account seeded OVER the
--       cap keeps every row and is refused only the next one); a REAL race at
--       the final Free slot where exactly one of two concurrent inserts wins;
--       and a direct-bypass attempt as `authenticated` with the JWT claim set,
--       which the trigger refuses after RLS has already been satisfied.
--
--  ── WHAT THIS IS, IN ONE LINE ─────────────────────────────────────────────
--
--  One plan-resolution function, one generic trigger function, four triggers.
--  No table is altered, no row is read for rewriting, nothing is deleted, and
--  there is no backfill.
--
--  ── COMMERCIAL vs SECURITY, WHICH ARE DELIBERATELY NOT THE SAME LAYER ─────
--
--  RLS on these tables answers "does this user own this row?" and is UNTOUCHED
--  by this file: no policy is created, altered or dropped. This file adds a
--  separate, additive commercial question - "is this user's plan allowed
--  another one?" - as a trigger. The distinction matters because the two layers
--  have opposite failure preferences: a security control must fail closed, and a
--  commercial control should fail generously, since refusing a paying customer
--  is worse than allowing one extra row.
--
--  `src/features/billing/sqlLimitContract.test.ts` reads THIS FILE and asserts
--  every cap below equals the TypeScript entitlement table, so the two cannot
--  drift.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. THE DATABASE'S SINGLE SOURCE OF COMMERCIAL TRUTH
-- ----------------------------------------------------------------------------
--
--  Reads `public.billing` and nothing else. That is what makes it trustworthy:
--  `billing` has SELECT-own RLS and NO insert, update or delete policy for any
--  client role, and every write goes through the SECURITY DEFINER Stripe
--  functions (`apply_stripe_billing_event` and friends). A client therefore
--  cannot state its own plan, which is the property the brief requires - the
--  trigger must never trust an entitlement flag supplied by the caller.
--
--  SECURITY INVOKER (the default), deliberately, NOT SECURITY DEFINER. The only
--  row this ever needs is the caller's own, and `billing`'s SELECT-own policy
--  already permits exactly that. Elevating to DEFINER would grant the function
--  the ability to read every customer's billing state in order to answer a
--  question about one, which is privilege this does not need.
--
--  STABLE, not IMMUTABLE: the answer depends on table contents.
create or replace function public.effective_plan(uid uuid)
returns text
language sql
stable
set search_path to ''
as $$
  select coalesce(
    (select b.plan from public.billing b where b.user_id = uid and b.plan = 'pro' limit 1),
    'free'
  );
$$;

comment on function public.effective_plan(uuid) is
  'Commercial tier for a user, from public.billing only. Never trusts client input. '
  'Mirrors resolveEffectivePlan in src/features/billing/planCore.ts EXCEPT for the '
  'founding-email allowlist, which the database cannot see - see the STOP note in '
  'docs/proposals/SERVER_ENFORCEMENT_OPTION_B.md before relying on this.';

revoke all on function public.effective_plan(uuid) from public;
grant execute on function public.effective_plan(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
--  2. ONE GENERIC ENFORCEMENT FUNCTION, NOT FOUR COPIES
-- ----------------------------------------------------------------------------
--
--  Parameterised by trigger arguments so the same body serves every capped
--  table. The brief is explicit that four unrelated copies of
--  `if count >= N then` is the wrong shape, and it is also how the client half
--  drifted in the first place.
--
--  THE ADVISORY LOCK IS THE ENTIRE RACE FIX, and it is copied from
--  `calendar_sources_enforce_cap`, which already ships and is already proven
--  against the two concurrency cases in db-tests/calendarSourcesGuard.db.test.ts.
--  A bare `select count(*)` then `insert` races: two transactions both read
--  count = limit - 1 and both succeed. The lock serialises concurrent inserts
--  for ONE user and nothing else, so the second transaction blocks until the
--  first commits and only then counts - by which time it sees the new row.
--
--  GRANDFATHERING IS THE `>=` COMPARISON AND NOTHING ELSE. An account already
--  above the cap is refused a NEW row and keeps every row it has. No existing
--  row is examined, updated, hidden or deleted, on any code path in this file.
create or replace function public.enforce_free_count_limit()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  feature text    := tg_argv[0];
  cap     integer := tg_argv[1]::integer;
  n       integer;
begin
  -- Pro is unlimited on every capped surface, so resolve first and leave early.
  if public.effective_plan(new.user_id) = 'pro' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('todonado.free_count_limit.' || feature),
    hashtext(new.user_id::text)
  );

  -- `%I` quotes the identifier, and the identifier comes from the trigger
  -- context (`tg_table_name`), never from user input.
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name)
     into n
    using new.user_id;

  if n >= cap then
    /*
     * THE ERROR CONTRACT. The client must not have to read PostgreSQL prose.
     *
     * `check_violation` (23514) is reused rather than a bespoke SQLSTATE because
     * PostgREST's HTTP mapping for a custom class could not be verified without
     * a local stack (see the blocker note in the accompanying document), and
     * guessing at it would be worse than reusing a code whose 400 mapping is
     * already relied on elsewhere in this schema.
     *
     * The MESSAGE therefore carries the machine-readable part: a fixed
     * `free_limit_reached:` prefix, the feature key, and the cap. The existing
     * size/shape CHECKs on these same tables also raise 23514, which is why the
     * prefix rather than the code is what the client keys on.
     */
    raise exception 'free_limit_reached:%:%', feature, cap
      using errcode = 'check_violation',
            hint    = feature;
  end if;

  return new;
end
$$;

comment on function public.enforce_free_count_limit() is
  'BEFORE INSERT commercial cap for count-limited app entities. Refuses a NEW row '
  'only; never touches, hides or deletes an existing one. Args: feature key, cap.';

revoke all on function public.enforce_free_count_limit() from public;
grant execute on function public.enforce_free_count_limit() to authenticated, service_role;

-- ----------------------------------------------------------------------------
--  3. THE FOUR TRIGGERS
-- ----------------------------------------------------------------------------
--
--  BEFORE INSERT only. An UPDATE cannot change any user's count on these tables
--  (none of them permits changing `user_id`; the owner-only update policies all
--  require `user_id = auth.uid()` on both sides), and a DELETE only ever lowers
--  it, so neither needs a hook.
--
--  The caps are duplicated from the TypeScript entitlement table, which is
--  unavoidable across a language boundary. `sqlLimitContract.test.ts` reads this
--  file and fails if any number here stops matching
--  `ENTITLEMENTS.free.limits` in src/features/billing/entitlements.ts.
--
--  `user_challenges` IS DELIBERATELY ABSENT. Its Free limit counts challenges
--  whose DERIVED phase is active, and that derivation needs the per-challenge
--  `durationDays` from the TypeScript catalog, a progress computation over four
--  other tables, and the user's local calendar day. The database has none of the
--  three. Enforcing it here would require reimplementing a feature in SQL, and a
--  trigger counting `status = 'active'` instead would be STRICTER than the UI -
--  it would refuse joins the app had just told the user were available. See the
--  accompanying document.

drop trigger if exists enforce_free_limit on public.user_templates;
create trigger enforce_free_limit
  before insert on public.user_templates
  for each row execute function public.enforce_free_count_limit('personalTemplates', '5');

drop trigger if exists enforce_free_limit on public.vision_cards;
create trigger enforce_free_limit
  before insert on public.vision_cards
  for each row execute function public.enforce_free_count_limit('visionCards', '5');

drop trigger if exists enforce_free_limit on public.mind_maps;
create trigger enforce_free_limit
  before insert on public.mind_maps
  for each row execute function public.enforce_free_count_limit('mindMaps', '3');

drop trigger if exists enforce_free_limit on public.quit_habits;
create trigger enforce_free_limit
  before insert on public.quit_habits
  for each row execute function public.enforce_free_count_limit('quitHabits', '3');

-- ============================================================================
--  ROLLBACK. Deterministic, four statements plus two drops, no data touched.
-- ============================================================================
--
--    drop trigger if exists enforce_free_limit on public.user_templates;
--    drop trigger if exists enforce_free_limit on public.vision_cards;
--    drop trigger if exists enforce_free_limit on public.mind_maps;
--    drop trigger if exists enforce_free_limit on public.quit_habits;
--    drop function if exists public.enforce_free_count_limit();
--    drop function if exists public.effective_plan(uuid);
--
--  Dropping the triggers restores the previous behaviour exactly: the caps go
--  back to being client-side. No row was ever modified, so there is nothing to
--  restore and no window in which data could have been lost.
-- ============================================================================
