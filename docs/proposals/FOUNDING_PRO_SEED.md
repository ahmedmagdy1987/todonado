# Founding-Pro seed — review material

**Verified read-only 2026-08-18** (`supabase_read_only_user`, `transaction_read_only = on`,
37 migrations, latest `20260808120000`).

> **NOTHING HERE HAS BEEN EXECUTED. Production billing writes: 0.**
> Every statement below is review material. The seed is the prerequisite for
> `20260818120000_free_count_limits.sql`, and must run *before* it.

---

## 1. Why a seed is needed at all

`public.billing` is **empty**: 16 users, 0 rows. The only thing that makes anyone Pro today is a
TypeScript email allowlist (`FOUNDING_EMAILS` in `planCore.ts`) that the database cannot see. Any
database-side entitlement check therefore resolves the owner's own account as **Free**.

The allowlist is also fragile in its own right, and the file says so: email is a self-service
attribute on a product with autoconfirmed signup, so an address added before its owner registers it
could be claimed by a stranger. A billing row is data the user cannot set.

---

## 2. Every founding / manual Pro source in the repository

| Source | Location | Identifier | Runtime | Production relevant | Notes |
| --- | --- | --- | --- | :---: | --- |
| `FOUNDING_EMAILS` | `src/features/billing/planCore.ts:41` | email string ×2 | client **and** server | **YES** | The only production path. Server additionally requires `email_verified` |
| `readPlanOverride()` | `src/features/billing/plan.ts:46` | `localStorage.todonado.plan` | client | **no** | Whole branch behind `import.meta.env.DEV`; dropped from the production bundle. Used by 8 E2E specs |
| `VITE_PRO_PREVIEW` | `src/features/billing/plan.ts:74` | build flag | client | **no** | Inside the same DEV branch |
| `resolvePlan()` | `src/features/billing/plan.ts:31` | email + override | — | **no** | **Dead code.** No caller outside its own definition |
| Stripe billing row | `public.billing` | `plan = 'pro'` | client + server | YES | The intended long-term source. Currently 0 rows |

There is **no** user-id allowlist, **no** environment-based production override, and **no**
historical-compatibility path. Confirmed by exhaustive grep across `src/`, `api/` and `supabase/`.

---

## 3. Resolved production users

| user_id | email | created_at | verified | billing row | app resolves Pro | source | notes |
| --- | --- | --- | :---: | :---: | :---: | --- | --- |
| `fbc3f5a5-22ae-4ac6-8109-2d195c03a159` | `ahmedkassim17777@gmail.com` | 2026-06-02 | ✅ | ❌ none | ✅ yes | `FOUNDING_EMAILS` | The only legitimate founding user |
| — | `journeypixofficial@gmail.com` | — | — | — | — | `FOUNDING_EMAILS` | **ALLOWLIST ENTRY — NO CURRENT USER** |

**Exact seed row count: 1.**

The second address is in the allowlist but has never registered. It is deliberately **not** seeded
and **no user is invented for it**. If that account is created later it will be granted Pro by the
allowlist exactly as today, and can be seeded then.

---

## 4. `public.billing`, as it actually is

| Column | Type | Null | Meaning |
| --- | --- | :---: | --- |
| `user_id` | uuid | NO | **PK**, FK → `auth.users` ON DELETE CASCADE |
| `plan` | text | NO | `'free'` \| `'pro'` (CHECK). **The resolved answer** |
| `stripe_customer_id` | text | **YES** | Portal needs it. NULL ⇒ portal answers `no_subscription` |
| `stripe_subscription_id` | text | **YES** | How subscription events find their row |
| `subscription_status` | text | **YES** | Stripe status. **No CHECK constraint** |
| `current_period_end` | timestamptz | YES | Renewal date |
| `updated_at` | timestamptz | NO | default `now()` |
| `last_stripe_event_id` | text | YES | De-duplicates redelivery |
| `last_stripe_event_at` | timestamptz | YES | Out-of-order high-water mark |

Constraints: `billing_pkey (user_id)` · `billing_plan_check` · `billing_user_id_fkey` (cascade).
No unique index on the Stripe columns. One trigger (`set_updated_at`).

Dependent functions: `apply_stripe_billing_event` (SECURITY DEFINER, all writes),
`apply_stripe_subscription_event`, `bind_verified_checkout`. Read directly by
`api/create-checkout-session.ts`, `api/create-portal-session.ts` and `resolveServerEntitlement`.

### CAN FOUNDING PRO FIT THIS SCHEMA SAFELY? **YES — no migration, no fake Stripe IDs.**

Because `subscription_status` has **no CHECK**, `'founding'` is a legal value; and because both
Stripe columns are **nullable**, they stay NULL.

---

## 5. The row model, and why the NULLs are the safety property

```
user_id                 <the founding user>
plan                    'pro'
subscription_status     'founding'
stripe_customer_id      NULL
stripe_subscription_id  NULL
current_period_end      NULL
last_stripe_event_id    NULL
last_stripe_event_at    NULL
```

Checked against every code path that touches `billing`:

| Requirement | Result | Why |
| --- | :---: | --- |
| DB can resolve the user as Pro | ✅ | `plan = 'pro'` is the answer `effective_plan` reads |
| Webhook cannot overwrite or corrupt it | ✅ | `apply_stripe_subscription_event` finds its target with `where stripe_subscription_id = …`. **NULL never matches**, so no subscription event can reach the row |
| Cancellation cannot downgrade it by mistake | ✅ | Same reason. Worth noting *why* this matters: both downgrade guards inside `apply_stripe_billing_event` are conditioned on non-NULL `last_stripe_event_at` / `stripe_subscription_id`, which a founding row lacks — so being **unreachable** is doing the work that the guards could not |
| Portal does not assume a subscription | ✅ | `PlanPage` gates the button on `hasRealSubscription`, now `plan === 'pro' && !!stripe_customer_id`. **This had to be fixed first** — see §6 |
| Normal paid users unchanged | ✅ | Nothing about their rows or code paths changes |
| Founder can still subscribe for real | ✅ | The checkout duplicate-guard short-circuits on a NULL `stripe_subscription_id`; the webhook then `coalesce`s the Stripe columns into the same row |
| Resolver distinguishes founding from paid | ✅ | `subscription_status = 'founding'` (`FOUNDING_STATUS`) |

### ⚠️ Two client fixes were required *before* the seed, and are in this PR

Both would have been regressions introduced **by** the seed:

1. **`PlanPage.hasRealSubscription`** was `billing?.plan === 'pro'`. After the seed that goes **true**
   for the founder, showing a "Manage subscription" button that opens the Stripe portal — which
   answers `400 no_subscription` because there is no customer. Now keyed on `stripe_customer_id`.
2. **`usePlan().isFounding`** was `isPro && billing?.plan !== 'pro' && isFoundingEmail(email)`. After
   the seed `billing.plan` **is** `'pro'`, so it would have gone false and the owner would have been
   silently reclassified as an ordinary subscriber. Now also recognises `FOUNDING_STATUS`.

---

## 6. Seed preview — exactly one row

| user_id | email | plan | status | Stripe customer | Stripe subscription | reason |
| --- | --- | --- | --- | :---: | :---: | --- |
| `fbc3f5a5-22ae-4ac6-8109-2d195c03a159` | `ahmedkassim17777@gmail.com` | `pro` | `founding` | **NULL** | **NULL** | Founding member; only registered allowlist address |

### A. Preconditions — the seed must refuse to run if any fail

```sql
-- Run inside the same transaction as the seed, before it.
do $$
declare
  n_target        integer;
  n_stripe_rows   integer;
  n_status_check  integer;
begin
  -- 1. EXACTLY the reviewed user, matched by BOTH id and email.
  select count(*) into n_target
    from auth.users
   where id = 'fbc3f5a5-22ae-4ac6-8109-2d195c03a159'
     and lower(email) = 'ahmedkassim17777@gmail.com'
     and email_confirmed_at is not null;
  if n_target <> 1 then
    raise exception 'precondition failed: reviewed founding user not found exactly once (got %)', n_target;
  end if;

  -- 2. The target must not already carry a Stripe-backed row. Overwriting a
  --    real subscription with a founding marker would destroy billing state.
  select count(*) into n_stripe_rows
    from public.billing
   where user_id = 'fbc3f5a5-22ae-4ac6-8109-2d195c03a159'
     and (stripe_customer_id is not null or stripe_subscription_id is not null);
  if n_stripe_rows <> 0 then
    raise exception 'precondition failed: target already has Stripe billing state';
  end if;

  -- 3. The schema must be the one that was reviewed: no CHECK may have been
  --    added to subscription_status that would reject 'founding'.
  select count(*) into n_status_check
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = 'billing'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%subscription_status%';
  if n_status_check <> 0 then
    raise exception 'precondition failed: subscription_status gained a CHECK since review';
  end if;
end $$;
```

### B. The seed

```sql
begin;

-- (preconditions from A run here, inside the same transaction)

insert into public.billing (user_id, plan, subscription_status)
values ('fbc3f5a5-22ae-4ac6-8109-2d195c03a159', 'pro', 'founding')
on conflict (user_id) do update
   set plan                = 'pro',
       subscription_status = 'founding'
 where public.billing.stripe_customer_id is null
   and public.billing.stripe_subscription_id is null;

commit;
```

**Idempotent** (`on conflict do update`, same values). **Targeted** (one literal id).
**Transaction-wrapped.** **Non-destructive**: the `where` on the update clause means it can never
overwrite a row that has acquired real Stripe state between review and execution — belt as well as
the braces in precondition 2.

### C. Verification (read-only, after)

```sql
select u.email,
       b.plan,
       b.subscription_status,
       b.stripe_customer_id,
       b.stripe_subscription_id,
       public.effective_plan(b.user_id) as resolved   -- only after the trigger migration
  from public.billing b
  join auth.users u on u.id = b.user_id
 where b.user_id = 'fbc3f5a5-22ae-4ac6-8109-2d195c03a159';

-- Expect exactly: pro | founding | NULL | NULL
-- And nothing else changed:
select count(*) as billing_rows from public.billing;   -- expect 1
```

### D. Rollback

```sql
-- The row was created by the seed and contains no customer data, so removing it
-- restores the previous state exactly. The user does NOT lose access: the
-- FOUNDING_EMAILS allowlist still grants Pro in the application, which is where
-- it comes from today.
delete from public.billing
 where user_id = 'fbc3f5a5-22ae-4ac6-8109-2d195c03a159'
   and subscription_status = 'founding'
   and stripe_customer_id is null
   and stripe_subscription_id is null;
```

**No user content is touched by any of the above.** `billing` holds no journals, tasks or
recordings; rolling back removes an entitlement marker and nothing else.

---

## 7. `effective_plan(uuid)` — precedence and truth table

**Precedence is one rule: read the `plan` column.** It is unambiguous because the webhook has
*already* applied the status→plan mapping (`ACTIVE_STATUSES = {active, trialing, past_due}` in
`webhookMapping.ts`), so `plan` is the resolved answer and `subscription_status` is informational.
Re-deriving from status in SQL would be a second, divergent copy of that policy.

| Billing state | `plan` | `subscription_status` | effective plan | Why |
| --- | :---: | --- | :---: | --- |
| No row | — | — | **free** | Never billed. An answer, not a failure |
| Paid, live | `pro` | `active` | **pro** | — |
| Paid, in trial | `pro` | `trialing` | **pro** | Webhook grants during trial |
| Paid, dunning | `pro` | `past_due` | **pro** | Access is deliberately kept during dunning |
| **Founding** | `pro` | `founding` | **pro** | The seeded row |
| Cancelled | `free` | `canceled` | **free** | Webhook already downgraded |
| Incomplete / unpaid | `free` | `incomplete`, `unpaid` | **free** | Never granted |
| Contradictory | `free` | `active` | **free** | `plan` wins. The webhook is authoritative; a status that disagrees means the row is mid-update, and the safe reading of an inconsistent row is the lower tier |

No fallback is ambiguous: every state maps to exactly one answer, and the only input is one column.

---

## 8. Production application runbook — prepared, NOT executed

| Step | Action | Where | Gate |
| :-: | --- | --- | --- |
| 1 | Confirm reviewed heads: main `f92e9e7`, #34 `74c8a92`, #35 `<this head>` | local | SHAs match |
| 2 | Re-run §3 and §4 read-only. Confirm still 16 users / 0 billing rows and the schema is unchanged | MCP (read-only) | matches review |
| 3 | **Merge #34, then #35** | GitHub | reviewed |
| 4 | Run the §6 preconditions **and** seed in ONE transaction | SQL editor, owner, real terminal | preconditions raise on any mismatch |
| 5 | Run §6C verification | read-only | `pro / founding / NULL / NULL`, 1 row |
| 6 | Confirm the founder's app still reads "Founding member access, no billing needed." and shows **no** portal button | browser | visual |
| 7 | Stand up a writable test database, run `npm run test:db` **including** new enforcement tests | CI or local Docker | all green, 0 skipped |
| 8 | Only then move `20260818120000_free_count_limits.sql` into `supabase/migrations/` and apply | owner | step 7 green |
| 9 | Verify Free capped / Pro uncapped / founder uncapped | browser + SQL | matches contract |
| 10 | Voice notes: separate change (client rewire + storage policy). **Not** part of this sequence | — | own review |

**Steps 4 and 8 are the only writes, and neither happens this turn.**

---

## 9. Rollback plan

| What | How | User data |
| --- | --- | :---: |
| **A. Founding seed** | §6D `delete`. The user keeps Pro via the allowlist, so there is no access gap | untouched |
| **B. Count-limit migration** | 4 × `drop trigger` + 2 × `drop function`. Caps revert to client-side | untouched |
| **C. Voice-note enforcement** | Revert the client to the direct upload; re-add the broad storage INSERT policy | untouched |

**No rollback deletes customer content, and none can.** The seed touches only `billing`; the triggers
only refuse new inserts; the storage change only affects who may *create* an object, never what
already exists.
