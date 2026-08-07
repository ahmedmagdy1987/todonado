-- ============================================================================
--  TODONADO — ISSUE #8
--  CLEANUP of Stripe TEST/Sandbox billing state, before switching to Live.
--
--  ┌──────────────────────────────────────────────────────────────────────┐
--  │  THIS FILE IS A DRY RUN. IT ENDS IN `rollback;`.                     │
--  │                                                                      │
--  │  Running it as committed executes every assertion and both DELETEs   │
--  │  inside one transaction, prints the real before/after numbers, and   │
--  │  then THROWS ALL OF IT AWAY. Nothing persists. Run it as often as    │
--  │  you like.                                                           │
--  │                                                                      │
--  │  To actually perform the cleanup, change the last statement to       │
--  │  `commit;` IN YOUR EDITOR SESSION ONLY, run it once, and do not      │
--  │  commit that change to the repository.                               │
--  └──────────────────────────────────────────────────────────────────────┘
--
--  Nothing runs this. It is not imported by the app, not a migration, not a
--  CI step, not an npm script, and not part of any deployment.
--  src/test/issue8CleanupSafety.test.ts asserts all of that, and asserts that
--  the committed text still ends in `rollback;`.
--
--  Companion to docs/ISSUE_8_test_billing_inventory.sql, which is the read-only
--  half. Run the inventory FIRST. This file asserts that the inventory's exact
--  result is still true and aborts if it is not.
--
--  ── WHAT IT WOULD DELETE, AND THE EVIDENCE ────────────────────────────────
--
--  1 row from public.billing            (user c208748a…)
--  3 rows from public.checkout_attempts (all three, all terminal)
--
--  All four are Stripe TEST-mode artifacts. The proof is a chain, not a guess:
--
--    a. The ONLY stripe_session_id in checkout_attempts is `cs_test_…`.
--       Stripe emits that prefix in test mode only; live mode emits `cs_live_`.
--    b. That session's attempt (39ce9677…) has status `consumed`, and
--       20260801150000_checkout_attempts.sql writes `consumed` in exactly one
--       place — bind_verified_checkout(), the function that binds an attempt to
--       a billing row, in the same transaction.
--    c. The billing row carries the SAME stripe_subscription_id
--       (sub_1U18RS…) as that consumed, test-mode attempt.
--    d. billing.last_stripe_event_at (17:17:23Z) equals the attempt's updated_at
--       (17:17:26Z) to within the same webhook — one purchase, one binding.
--
--    The other two attempts (87224037…, c685bff6…) are status `failed` with
--    stripe_session_id NULL and stripe_subscription_id NULL. api/create-checkout
--    -session.ts writes `failed` from the catch block AFTER a Stripe call threw,
--    and records a session id only on success — so no Stripe object of any mode
--    was ever created for them. They are local, terminal, entitlement-free rows.
--
--  ── WHAT IT PRESERVES, AND WHY THE PREDICATE MATTERS ──────────────────────
--
--  The delete is gated on BOTH an explicit id AND the Stripe-identifier
--  predicate. A row that has since been stripped of its Stripe ids — i.e. has
--  become a manual/founding grant — will not match, the count assertion will
--  fail, and the whole transaction rolls back. "Delete every billing row" would
--  be simpler and would silently revoke founding access.
--
--  As of the 2026-08-07 inventory there are ZERO manual/founding billing rows,
--  so this run preserves nothing by that route. Founding Pro for the one
--  founding account (fbc3f5a5…) comes from FOUNDING_EMAILS in
--  src/features/billing/planCore.ts and has no billing row at all — it is
--  untouched by anything here.
--
--  ── THE CONSEQUENCE, STATED PLAINLY ───────────────────────────────────────
--
--  User c208748a… currently reads as Pro and will read as Free afterwards.
--  They subscribed with a TEST card; no money was taken and no live Stripe
--  subscription exists. If they should keep Pro, grant it with a manual row per
--  docs/BILLING_SETUP.md §6 (plan='pro', subscription_status='founding', no
--  Stripe ids) AFTER this runs — do not exempt them here.
--
--  ── SAFETY PROPERTIES ─────────────────────────────────────────────────────
--
--  * One explicit transaction, ending in ROLLBACK as committed. Every assertion
--    raises, and a raise aborts the transaction, so even the `commit;` variant
--    fails closed by construction.
--  * No TRUNCATE, no DROP, no ALTER, no GRANT, no CREATE — no DDL at all.
--  * auth.users is never named in a write. Both FKs point child -> parent
--    (billing.user_id, checkout_attempts.user_id -> auth.users ON DELETE
--    CASCADE), so deleting a child cannot reach the parent. Asserted anyway.
--  * profiles / projects / tasks / journal_entries / vision_cards / everything
--    else: row counts are snapshotted before and re-asserted after.
--  * LOCK ORDER IS checkout_attempts THEN billing, matching
--    bind_verified_checkout() -> apply_stripe_billing_event(). Taking them the
--    other way round would deadlock against a webhook landing mid-run.
--    SHARE ROW EXCLUSIVE blocks writers and still lets usePlan() read.
--
--  ── BEFORE YOU RUN THE `commit;` VARIANT ──────────────────────────────────
--
--  Stripe is still in TEST mode at this point (that is the premise of issue #8).
--  Do it while no checkout can be in flight, and re-run the inventory first —
--  if a new attempt or billing row has appeared since, this aborts rather than
--  guessing, which is the intended behaviour.
-- ============================================================================

begin;

-- Same order as the webhook path. See the header.
lock table public.checkout_attempts in share row exclusive mode;
lock table public.billing           in share row exclusive mode;

do $$
declare
  -- ── The inventory this file was written against ───────────────────────────
  --    (docs/ISSUE_8_test_billing_inventory.sql, run read-only 2026-08-07)
  k_billing_users  uuid[] := array[
                      'c208748a-cc5b-434b-993f-cf6e3f5093a9'
                    ]::uuid[];
  k_attempt_ids    uuid[] := array[
                      '39ce9677-ca5b-4a95-a928-91023bdf8ea8',
                      '87224037-fa27-4309-be1f-1e5255d64dc3',
                      'c685bff6-6584-4a84-aae4-4a03d3eccc55'
                    ]::uuid[];
  k_billing_total  bigint := 1;   -- rows in public.billing at inventory time
  k_attempts_total bigint := 3;   -- rows in public.checkout_attempts

  v_n              bigint;
  v_deleted        uuid[];
  v_preserve_count bigint;
  v_users_before   bigint;
  v_users_after    bigint;
  v_app_before     jsonb;
  v_app_after      jsonb;
begin
  -- ══ 0. THE SCHEMA IS WHAT WE THINK IT IS ════════════════════════════════
  if to_regclass('public.billing') is null
     or to_regclass('public.checkout_attempts') is null then
    raise exception 'ABORT: billing or checkout_attempts is missing.';
  end if;

  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'billing'
     and column_name in ('last_stripe_event_id', 'last_stripe_event_at');
  if v_n <> 2 then
    raise exception
      'ABORT: expected both last_stripe_event_* columns on billing, found %.', v_n;
  end if;

  /*
   * THE MIGRATION LEDGER IS CHECKED ONLY WHERE IT EXISTS, AND THAT IS
   * DELIBERATE — not a weakened assertion.
   *
   * `supabase_migrations.schema_migrations` is bookkeeping written by the CLI.
   * The four checks above are STRUCTURAL: they ask whether the objects those
   * migrations create are actually there, which is the stronger question and
   * the one that matters. A ledger row proves a file ran; it does not prove
   * anything installed (see db-tests/billingGrant.db.test.ts, which exists
   * because a shim once faked a grant the platform never gave).
   *
   * Production has the ledger and it is verified. A database built straight
   * from supabase/migrations — the disposable clone this file is validated
   * against — does not, because the applier runs the files without recording
   * them. Making the ledger mandatory would mean this script could never be
   * rehearsed anywhere except production, which is the opposite of safe.
   */
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    select count(*) into v_n
      from supabase_migrations.schema_migrations
     where version in ('20260801140000', '20260801150000',
                       '20260801160000', '20260801170000');
    if v_n <> 4 then
      raise exception
        'ABORT: expected 4 pre-live migrations recorded, found %.', v_n;
    end if;
  else
    raise notice 'no migration ledger on this database — structural checks only';
  end if;

  -- ══ 1. SNAPSHOT EVERYTHING THAT MUST NOT CHANGE ═════════════════════════
  select count(*) into v_users_before from auth.users;

  select jsonb_build_object(
           'profiles',        (select count(*) from public.profiles),
           'workspaces',      (select count(*) from public.workspaces),
           'projects',        (select count(*) from public.projects),
           'sections',        (select count(*) from public.sections),
           'tasks',           (select count(*) from public.tasks),
           'subtasks',        (select count(*) from public.subtasks),
           'focus_sessions',  (select count(*) from public.focus_sessions),
           'journal_entries', (select count(*) from public.journal_entries),
           'vision_cards',    (select count(*) from public.vision_cards),
           'quit_habits',     (select count(*) from public.quit_habits),
           'calendar_sources',(select count(*) from public.calendar_sources),
           'user_templates',  (select count(*) from public.user_templates))
    into v_app_before;

  -- ══ 2. BILLING — the state must match the inventory exactly ═════════════
  select count(*) into v_n from public.billing;
  if v_n <> k_billing_total then
    raise exception
      'ABORT: billing has % row(s); the inventory saw %. Re-run the inventory.',
      v_n, k_billing_total;
  end if;

  -- Rows that will be PRESERVED: no Stripe identifier of any kind.
  select count(*) into v_preserve_count
    from public.billing
   where stripe_customer_id     is null
     and stripe_subscription_id is null
     and last_stripe_event_id   is null;

  -- The in-scope set must be exactly the users this file names.
  select coalesce(array_agg(user_id), '{}'::uuid[]) into v_deleted
    from public.billing
   where stripe_customer_id     is not null
      or stripe_subscription_id is not null
      or last_stripe_event_id   is not null;

  if not (v_deleted @> k_billing_users and v_deleted <@ k_billing_users) then
    raise exception
      'ABORT: the Stripe-touched billing set is % but this file was written for %.',
      v_deleted, k_billing_users;
  end if;

  -- A founding account must never be swept up by the predicate.
  select count(*) into v_n
    from public.billing b
    join auth.users u on u.id = b.user_id
   where b.user_id = any(k_billing_users)
     and lower(u.email) in ('journeypixofficial@gmail.com',
                            'ahmedkassim17777@gmail.com');
  if v_n <> 0 then
    raise exception
      'ABORT: % row(s) in the delete set belong to a founding account.', v_n;
  end if;

  -- ══ 3. CHECKOUT ATTEMPTS — same, plus the test-mode proof ═══════════════
  select count(*) into v_n from public.checkout_attempts;
  if v_n <> k_attempts_total then
    raise exception
      'ABORT: checkout_attempts has % row(s); the inventory saw %.',
      v_n, k_attempts_total;
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_deleted
    from public.checkout_attempts;
  if not (v_deleted @> k_attempt_ids and v_deleted <@ k_attempt_ids) then
    raise exception
      'ABORT: checkout_attempts holds % but this file was written for %.',
      v_deleted, k_attempt_ids;
  end if;

  -- A non-terminal attempt is an OPEN purchase. Deleting one releases the
  -- one-open-per-user slot for a Checkout Session that may still be payable.
  select count(*) into v_n
    from public.checkout_attempts
   where status in ('reserved', 'session_created', 'completed');
  if v_n <> 0 then
    raise exception
      'ABORT: % non-terminal checkout attempt(s) exist. Let them settle first.', v_n;
  end if;

  -- Nothing here may be live-mode.
  select count(*) into v_n
    from public.checkout_attempts
   where stripe_session_id is not null
     and stripe_session_id not like 'cs_test_%';
  if v_n <> 0 then
    raise exception
      'ABORT: % checkout attempt(s) carry a session id that is not cs_test_. '
      'STOP and re-classify by hand — this may be live-mode state.', v_n;
  end if;

  -- ══ 4. DELETE — children of the purchase first, then the purchase ═══════
  with d as (
    delete from public.checkout_attempts
     where id = any(k_attempt_ids)
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_deleted from d;

  if cardinality(v_deleted) <> k_attempts_total then
    raise exception
      'ABORT: deleted % checkout attempt(s), expected %.',
      cardinality(v_deleted), k_attempts_total;
  end if;
  raise notice 'deleted % checkout_attempts row(s): %',
    cardinality(v_deleted), v_deleted;

  -- BOTH conditions. The predicate is the founding-row guarantee: an id that
  -- has since lost its Stripe identifiers will not match, the count assertion
  -- below fails, and everything rolls back.
  with d as (
    delete from public.billing
     where user_id = any(k_billing_users)
       and (stripe_customer_id     is not null
         or stripe_subscription_id is not null
         or last_stripe_event_id   is not null)
    returning user_id
  )
  select coalesce(array_agg(user_id), '{}'::uuid[]) into v_deleted from d;

  if cardinality(v_deleted) <> cardinality(k_billing_users) then
    raise exception
      'ABORT: deleted % billing row(s), expected %. A row no longer carries a '
      'Stripe identifier — it may have become a manual grant.',
      cardinality(v_deleted), cardinality(k_billing_users);
  end if;
  raise notice 'deleted % billing row(s): %', cardinality(v_deleted), v_deleted;

  -- ══ 5. POST-DELETE VERIFICATION ═════════════════════════════════════════
  select count(*) into v_n from public.checkout_attempts;
  if v_n <> 0 then
    raise exception 'VERIFY FAILED: % checkout_attempts row(s) remain.', v_n;
  end if;

  select count(*) into v_n
    from public.billing
   where stripe_customer_id     is not null
      or stripe_subscription_id is not null
      or last_stripe_event_id   is not null;
  if v_n <> 0 then
    raise exception 'VERIFY FAILED: % billing row(s) still carry a Stripe id.', v_n;
  end if;

  select count(*) into v_n from public.billing;
  if v_n <> v_preserve_count then
    raise exception
      'VERIFY FAILED: % billing row(s) remain, expected % preserved.',
      v_n, v_preserve_count;
  end if;

  select count(*) into v_users_after from auth.users;
  if v_users_after <> v_users_before then
    raise exception
      'VERIFY FAILED: auth.users went from % to %. Nothing here should touch it.',
      v_users_before, v_users_after;
  end if;

  select jsonb_build_object(
           'profiles',        (select count(*) from public.profiles),
           'workspaces',      (select count(*) from public.workspaces),
           'projects',        (select count(*) from public.projects),
           'sections',        (select count(*) from public.sections),
           'tasks',           (select count(*) from public.tasks),
           'subtasks',        (select count(*) from public.subtasks),
           'focus_sessions',  (select count(*) from public.focus_sessions),
           'journal_entries', (select count(*) from public.journal_entries),
           'vision_cards',    (select count(*) from public.vision_cards),
           'quit_habits',     (select count(*) from public.quit_habits),
           'calendar_sources',(select count(*) from public.calendar_sources),
           'user_templates',  (select count(*) from public.user_templates))
    into v_app_after;

  if v_app_after is distinct from v_app_before then
    raise exception
      'VERIFY FAILED: application data changed. before=% after=%',
      v_app_before, v_app_after;
  end if;

  raise notice '--------------------------------------------------------------';
  raise notice 'CLEAN. billing rows remaining: % (all manual/founding)', v_preserve_count;
  raise notice 'CLEAN. checkout_attempts rows remaining: 0';
  raise notice 'CLEAN. auth.users unchanged at %', v_users_after;
  raise notice 'CLEAN. application row counts unchanged: %', v_app_after;
  raise notice '--------------------------------------------------------------';
end
$$;

-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ THE COMMITTED DEFAULT. Everything above is discarded.                  │
-- │ Change this one word to perform the cleanup for real — in your editor  │
-- │ session, never in the repository.                                      │
-- └────────────────────────────────────────────────────────────────────────┘
rollback;

-- ============================================================================
--  AFTER A REAL RUN
--
--  * Re-run docs/ISSUE_8_test_billing_inventory.sql. Sections B and D must read
--    zero, section E must be empty, and section A must be unchanged.
--  * Only then switch Stripe to Live: rotate the keys and the webhook secret,
--    repoint STRIPE_PRICE_* / VITE_STRIPE_PRICE_* at live prices, and run
--    `npm run preflight:live`. Order of operations: docs/BILLING_SETUP.md §1.
--  * The Stripe TEST-mode objects themselves (cus_…, sub_…, cs_test_…) are not
--    touched by this file and do not need to be. Live mode has a separate id
--    space; test objects are invisible to it.
-- ============================================================================
