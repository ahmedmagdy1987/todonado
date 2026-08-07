# Billing — GO-LIVE runbook

> **Audience:** the owner, in a real terminal, with the Stripe dashboard open.
> **Rewritten 2026-08-01**, after the billing-dependent audit flags were closed.
>
> This replaces the old "paint-by-numbers when the keys arrive" version. That doc assumed test
> mode and left go-live as a four-line afterthought at the end. This one *is* the switch: the
> exact order, where every value comes from, and what to do when it goes wrong halfway.

---

## 00. PRE-MERGE GATE — none of this starts until every box is ticked

Nothing below runs against the live project while PR #1 is open. This section is
what "approved" means.

### 00.1 Required CI checks, with the counts they must report

All five jobs must be green **on the same head commit**. A green job with a wrong
count is a failure: every gate below exists because a suite that silently skipped
once reported success.

| Job | Must report |
| --- | --- |
| `typecheck · lint · unit · build` | typecheck, lint, **1515 unit tests**, production build |
| `e2e smoke (chromium, local supabase)` | **82 E2E tests**, 0 skipped, against a LOCAL stack |
| `database (postgres 17, disposable)` | **36 migrations** applied from empty **twice**; **128 tests**, 0 failed, 0 skipped; the `supabase.co` host refused *for the right reason* |
| `supabase postgrest permissions (local stack)` | **43 PostgREST tests** and **56 fresh-project tests**, 0 skipped |
| `enforcing CSP (production build)` | **9 CSP tests** against the built bundle behind the real enforcing policy |

### 00.2 The other pre-merge checks

- [ ] **PR #1 is still a DRAFT** and stays one until the architect converts it.
- [ ] **Secret scan** — `git log -p origin/main..HEAD | grep -nEi 'sk_live|sk_test|whsec_|service_role|SUPABASE_SERVICE_ROLE_KEY|-----BEGIN'`
      returns only documentation and variable NAMES, never a value.
- [ ] **Final diff review** — `git diff origin/main...HEAD --stat` reviewed file by
      file; no unrelated feature work, no generated output (`dist/`,
      `playwright-report/`, `.mobile-audit/`), no `ci-probe/**` branch left on the
      remote.
- [ ] **No CI job contacts the production database.** Both database jobs refuse a
      `supabase.co` host outright, the E2E and CSP jobs null-route the production
      hostname in `/etc/hosts` before they start, and
      `scripts/assert-local-supabase.mjs` fails the job before any socket opens.
- [ ] **The three pending billing migrations are still unapplied in production**
      (§01 tells you how to check without changing anything).

---

## 01. PRE-MIGRATION INSPECTION — read-only, run before you change anything

Run these in the Supabase SQL editor **before** §1. Every one is a SELECT; none
writes. Record the output somewhere outside this repository — it is the "before"
you will compare against and, if you have to roll back, the only description of
what the database looked like.

```sql
-- 1. Which PostgreSQL are we actually on? supabase/config.toml claims 17.
show server_version;

-- 2. The CURRENT billing ACL. This is what 20260801160000 will replace.
--    Expect the historical broad grants; after the migration, exactly two rows.
select coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC') as grantee,
       a.privilege_type
  from pg_class c
  left join lateral aclexplode(c.relacl) a on true
 where c.oid = 'public.billing'::regclass and a.grantee <> c.relowner
 order by 1, 2;

-- 3. How much billing state exists at all?
select count(*) as rows,
       count(*) filter (where plan = 'pro')  as pro,
       count(*) filter (where plan = 'free') as free,
       count(*) filter (where stripe_subscription_id is not null) as bound
  from public.billing;

-- 4. TEST-MODE leftovers. Stripe test ids are indistinguishable from live ones
--    by shape, so the only reliable marker is that they were written while
--    STRIPE_MODE was test. §02 is the decision (CLEAN SLATE) and explains why a
--    test-mode row must not survive into live; docs/ISSUE_8_test_billing_inventory.sql
--    is the fuller version of this query, and is the one to run.
select user_id, plan, subscription_status, stripe_customer_id,
       stripe_subscription_id, current_period_end, updated_at
  from public.billing
 where stripe_customer_id is not null
 order by updated_at desc;

-- 5. Inconsistent state worth knowing about BEFORE new rules start applying.
select user_id, plan, subscription_status, current_period_end,
       last_stripe_event_id, last_stripe_event_at
  from public.billing
 where (plan = 'pro' and subscription_status is distinct from 'active')
    or (plan = 'free' and stripe_subscription_id is not null)
    or (current_period_end is not null and current_period_end < now());

-- 6. Migration history — what the project believes it has applied.
select version, name from supabase_migrations.schema_migrations order by version;
--    The last row should be 20260801130000. If 20260801140000 or later is
--    already there, STOP: someone has applied part of this work and §1 is not
--    the right starting point.

-- 7. Does the event-ordering column pair exist yet? (Belt to 6's braces.)
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'billing'
   and column_name like 'last_stripe_event%';
```

> **Do not run these from CI, a script, or an agent shell.** They are read-only,
> but the credential that can run them is not, and this repository's rule is that
> no automation holds a production database connection.

---

## 02. THE TEST → LIVE DATA POLICY (issue #8) — decided, and the decision is CLEAN SLATE

**The decision (2026-08-07, owner):** before Stripe is switched to Live, every Stripe
TEST/Sandbox billing artifact is REMOVED from the production database, and Live billing starts
from a clean billing state.

This section is the answer to issue #8. It was open because `billing` has no `livemode` /
`stripe_mode` column — `grep -rniE "stripe_mode|livemode" supabase/migrations` still returns
nothing — so a row does not record which Stripe mode created it, and after the switch a Sandbox
row still reads `plan = 'pro'`. The webhook will not correct it either: `livemodeMatches` refuses
to act on an event whose mode disagrees with `STRIPE_MODE`, so a live-mode event never touches a
row created in test mode. It would sit there granting Pro forever.

**No schema change is needed to close this, and none is being made.** A `stripe_mode` column would
make the question self-answering next time, but it is a migration bought to describe rows that are
about to be deleted.

### 02.1 What is in scope, and what the discriminator actually is

Exactly two tables hold Stripe state. Nothing else in the schema does — `profiles` deliberately has
no `plan` column (see the header of `20260706130000_billing.sql`), and `events`,
`upgrade_intents` and `feature_intents` are signal-only with no entitlement and no Stripe ids.

| Table | Stripe columns | Present in production today? |
|---|---|---|
| `public.billing` | `stripe_customer_id`, `stripe_subscription_id` | **yes** |
| `public.billing` | `last_stripe_event_id`, `last_stripe_event_at` | **no** — added by `20260801140000`, still unapplied |
| `public.checkout_attempts` | `stripe_session_id`, `stripe_subscription_id` | **no** — created by `20260801150000`, still unapplied |

> **So today the cleanup is almost certainly a `billing`-only operation.** If the migrations are
> applied first, `checkout_attempts` exists and is in scope too; it will be empty unless a checkout
> has been started since. The inventory query answers this rather than assuming it.

**THE DISCRIMINATOR IS THE PRESENCE OF A STRIPE ID, NOT THE EXISTENCE OF THE ROW.**

```
in scope  :  stripe_customer_id is not null  OR  stripe_subscription_id is not null
preserved :  both null
```

"Delete every row in `billing`" is the obvious policy and it is **wrong**, because §6 of this
document grants founding Pro with exactly such a row:

```sql
insert into public.billing (user_id, plan, subscription_status)
select id, 'pro', 'founding' from auth.users where email in (…)
```

That row has no Stripe id, was never created by Stripe, and is the durable fix for audit FLAG-8.
A blanket delete would revoke it and silently re-expose the email-string grant it replaced.

### 02.2 What must survive — non-negotiable

- **Every `auth.users` row**, and everything hanging off it: `profiles`, `workspaces`,
  `projects`, `sections`, `tasks`, `subtasks`, `focus_sessions`, `calendar_sources`,
  `user_templates`, `quit_habits`, `quit_checkins`, `vision_cards`, `mind_maps`,
  `user_challenges`, `journal_entries`, `wellness_items`, `wellness_logs`, `events`,
  `upgrade_intents`, `feature_intents`, and the `journal-audio` storage objects.
- **Manual / founding `billing` rows** — any row with both Stripe ids null.
- **The migration history.** Nothing here applies, reverses or re-runs a migration.

`billing.user_id` and `checkout_attempts.user_id` both reference `auth.users (id) on delete
cascade`, and **nothing references either table**. So the cascade runs *towards* these rows and
never *from* them: deleting them cannot reach application data. That is a property of the schema,
not a promise — it is why this cleanup is safe at all.

### 02.3 Expected user-facing impact

| Who | Before | After | Why |
|---|---|---|---|
| A user Pro **only** via the Sandbox subscription | Pro | **Free** | Intended. The row granting it was test-mode state. |
| A founding account (`FOUNDING_EMAILS`, currently 2 addresses) | Pro | **Pro** | `resolveEffectivePlan` falls through to the email allow-list, and any seeded `founding` row is preserved anyway. |
| A user with a manual `billing` row, no Stripe ids | as granted | **unchanged** | Out of scope by the discriminator. |
| Everyone else | Free | Free | No row to delete. |

Nobody loses a task, a project, a journal entry or an account. The only thing that changes is an
entitlement that was never paid for in live mode.

> **Downgrade is silent by design.** There is no email, no banner and no "your plan changed"
> notice — none exists in the product. If the Sandbox subscriber is a real person rather than a
> test account, tell them out of band before you run it.

### 02.4 The preflight, in order

1. **Read-only inventory.** Run `docs/ISSUE_8_test_billing_inventory.sql` in the Supabase SQL
   editor. One statement, SELECT only, safe to repeat. It reports which of the two tables exist,
   counts, every affected row tagged `DELETE` or `PRESERVE`, and three cross-checks. Read
   section **E** before anything else.
2. **Account for every row.** Each `DELETE` row must be explicable as Sandbox-era. Each
   `PRESERVE` row must be a grant you recognise. **If either is not true, stop** — an unexplained
   Stripe id is the one finding that invalidates the clean-slate assumption.
3. **Repo preflight.** `npm run preflight:live`. Read-only, no network, no database, no Stripe. It
   checks the four pre-live migration files, the Vercel function budget, that the enforcing CSP
   still allows `checkout.stripe.com`, that the published prices are still $5 / $48, and — where
   the vars happen to be present — that `STRIPE_MODE` agrees with every key and price. It answers
   **READY FOR LIVE** or **NOT READY FOR LIVE** and says why. It never prints a value.
4. **Cleanup**, then §1 (migrations), then §2–§6 (Stripe + env + webhook), then §7 (verify).

The cleanup transaction itself is deliberately **not** stored in this repository. It is written
against the inventory output — the row counts it asserts are the ones actually observed — so a
version committed today would be stale the moment a row changed, and a stale destructive script in
a docs folder is an invitation. Write it from the inventory, run it once, in a real terminal.

**The shape it must have**, whoever writes it:

- explicit `begin;` … `rollback;` first, to read the counts, then a second run with `commit;`
- pre-delete counts asserted against the inventory, and a `raise exception` if they disagree
- `delete from public.checkout_attempts where …` before `delete from public.billing where …`
  (no FK forces this; it is the order the data was created in)
- both deletes carrying the `stripe_customer_id is not null or stripe_subscription_id is not null`
  predicate **in the statement itself**, never a bare `delete from public.billing`
- a post-delete verification selecting the same predicate and expecting **zero** rows, plus a
  count of preserved rows that must be **unchanged**
- no `truncate`, no `drop`, no `alter`, and no statement touching a table outside the two

### 02.5 Verifying the cleanup

Re-run `docs/ISSUE_8_test_billing_inventory.sql`. It is the same query, so it is directly
comparable to the "before" you saved. It must now report:

- **B.11** `IN CLEANUP SCOPE — rows carrying a Stripe id` = **0**
- **B.12** `PRESERVED` = the same number as before
- **B.13 / B.14** distinct customer and subscription ids = **0**
- **D.30** `checkout_attempts` rows = **0** (or the table still absent)
- **C** contains no `[WOULD DELETE]` row

Then, in the app: the Sandbox subscriber's `/settings/plan` reads Free, and a founding account
still reads Pro.

### 02.6 Detecting a mixed Test/Live state afterwards

Mixed state is the failure this whole section exists to prevent — a live deployment holding
test-mode rows, or a live key next to a test price. Three independent detectors, and they are
independent on purpose:

1. **The database.** After cleanup, ANY row in `billing` carrying a Stripe id was created by the
   live account. Before you have live customers, `B.11 > 0` means something test-mode survived or
   returned. This is the check that only works because the slate was wiped.
2. **The deployment.** `stripeModeProblems()` (`api/_lib/config.ts`) cross-checks `STRIPE_MODE`
   against the secret key prefix, the publishable key prefix and both price-id pairs on every
   request; a disagreement answers `503 billing_misconfigured` and **refuses to sell** rather than
   guessing. `npm run preflight:live` runs the same rules ahead of time where the vars are visible.
3. **The event stream.** `livemodeMatches()` refuses any Stripe object or webhook event whose
   `livemode` disagrees with the declared mode — `503 livemode_mismatch`, which Stripe retries, so
   a genuine event queued during a misconfiguration is not lost. §3 explains why this is checked
   against `STRIPE_MODE` and never inferred, and why `whsec_` is not a mode signal.

**Live price ids and the webhook signing secret cannot be verified from the repo.** A `price_…` id
is opaque and `whsec_…` does not encode mode, so both are manual gates in the preflight
(`--live-prices-verified`, `--webhook-verified`). Verify prices in the Stripe dashboard by
*amount* — a live recurring **$5/month** and a live recurring **$48/year** — and copy all four
price vars from one clipboard (§3, §8's first rollback row).

### 02.7 Rolling back

**The cleanup itself is not reversible** — deleted rows are gone, which is why it runs inside a
transaction you have already dry-run with `rollback`. There is nothing to undo in the ordinary
sense, and nothing that needs undoing: the rows described subscriptions that only ever existed in
a Sandbox account.

If a deletion turns out to have been wrong, the repair is to re-grant the entitlement directly —
the §6 insert, with `subscription_status = 'founding'` or another honest label — **not** to
reconstruct a fake Stripe id. A row naming a subscription that does not exist in the live account
is worse than the problem it would be papering over.

Everything else rolls back normally: application deployment §8.1, Stripe keys §8.2, webhook
endpoint §8.3, prices §8.4, and the **emergency stop** — delete `STRIPE_SECRET_KEY` and redeploy,
which makes checkout `503`, falls the UI back to the fake-door modal, and leaves existing
subscribers working (§8's last row). Full retreat to test mode is the paragraph under §8's table.

---

## 0. THE ORDER IS THE RUNBOOK

Every step works if you do it in this order, and fails in a specific, recoverable way if you do
not. Three orderings actually matter:

0. **Clear the Sandbox billing rows BEFORE setting live keys** (§02). After the switch a live-mode
   webhook will not touch a row created in test mode — `livemodeMatches` refuses it — so a Sandbox
   row left behind grants Pro indefinitely and nothing corrects it.
1. **Apply all four migrations BEFORE setting live keys.** The webhook refuses to write against a
   database without the event-ordering columns — it answers `503 billing_schema_outdated` and
   grants nothing. That is deliberate (§1), but it means a checkout completed before the
   migrations land does not upgrade anyone until Stripe's retries succeed. The third file is the
   one that lets the server read `billing` at all: without it checkout answers
   `500 billing_lookup_failed` and nothing can be sold (§1.3).
2. **Create the webhook endpoint and set its signing secret BEFORE telling anyone.** With
   `STRIPE_WEBHOOK_SECRET` unset the webhook answers `503 not_configured`. Stripe retries for
   ~3 days so nothing is lost, but no plan flips until it is right.

| # | Step | Where | Reversible? |
|---|---|---|---|
| 0a | Run the read-only inventory, account for every row | Supabase SQL editor | n/a — SELECT only |
| 0b | Run `npm run preflight:live` | your terminal | n/a — read-only |
| 0c | Delete the Sandbox billing rows (§02) | Supabase SQL editor | **no** — dry-run with `rollback` first |
| 1 | Apply the **four** pending migrations, in order | your terminal | see §1 — two are additive, two narrow privileges |
| 2 | Create live product + prices | Stripe dashboard | yes |
| 3 | Set the seven env vars | Vercel | yes |
| 4 | Redeploy (no build cache) | Vercel | yes |
| 5 | Create the live webhook endpoint | Stripe dashboard | yes |
| 6 | Set `STRIPE_WEBHOOK_SECRET`, redeploy again | Vercel | yes |
| 7 | Verify with a real card | production | refund |

---

## 1. Apply the migrations — FIRST, before any live key

**FOUR files are pending, and the order is chronological.** `supabase db push` applies them in
this order by itself; the list is here so you can check what landed, and run them by hand if you
prefer.

| # | File | What it does | Class |
|---|---|---|---|
| 1 | `20260801140000_billing_event_ordering.sql` | two nullable columns on `billing` + `apply_stripe_billing_event` | **additive**, plus **behaviour-changing** (the webhook starts refusing out-of-order events instead of applying them) |
| 2 | `20260801150000_checkout_attempts.sql` | the `checkout_attempts` table and the reserve/mark/bind functions | **additive**, plus **behaviour-changing** (checkout starts reserving a durable attempt) |
| 3 | `20260801160000_billing_service_role_access.sql` | the SQL privilege contract for `billing` | **privilege-changing** — NOT purely additive, see §1.3 |
| 4 | `20260801170000_application_data_api_grants.sql` | the SQL privilege contract for every other application table | **privilege-changing** — NOT purely additive, see §1.4 |

> **Nothing here is behaviour-changing for a user who is not buying anything.**
> Files 1 and 2 only alter the money path, which is inert until live keys are
> set. Files 3 and 4 narrow privileges to exactly what the application uses, so a
> correctly-working app sees no difference — that claim is what the fresh-project
> smoke suite exists to make checkable rather than reassuring.

```bash
supabase login                                   # real terminal; a non-TTY shell cannot
supabase link --project-ref lplsbfduankkpglyusjp
supabase db push
```

### 1.1 — `20260801140000_billing_event_ordering.sql`

```sql
alter table public.billing
  add column if not exists last_stripe_event_id text,
  add column if not exists last_stripe_event_at timestamptz;
```

(The file also carries two `comment on column` statements — documentation only, plus the
`apply_stripe_billing_event` function.)

**Why it is safe.** Both columns are nullable with no default, so this is a catalog-only change:
no table rewrite, no validation pass over existing rows. Unlike a CHECK constraint it cannot fail
on data already present.

**Why it is required, not optional.** Without these columns the webhook cannot distinguish a
redelivered or out-of-order Stripe event from a new one, and Stripe's own retry behaviour would
silently downgrade paying customers (audit FLAG-3). Rather than fall back to the old unordered
write, the handler refuses:

```
503 {"error":"billing_schema_outdated"}
[api/stripe-webhook] billing is missing the event-ordering columns — apply
supabase/migrations/20260801140000_billing_event_ordering.sql. Refusing to write.
```

Confirm it landed:

```sql
select column_name from information_schema.columns
where table_name = 'billing' and column_name like 'last_stripe_event%';
-- expect exactly two rows
```

### 1.2 — `20260801150000_checkout_attempts.sql`

Creates `public.checkout_attempts` (server-only: RLS on, no policy of any kind, no table grant to
anybody) and the four SECURITY DEFINER functions the money path drives. Purely additive.
`api/create-checkout-session.ts` answers `503 billing_schema_outdated` until it lands.

```sql
select to_regclass('public.checkout_attempts') is not null as table_present;
-- expect true
```

### 1.3 — `20260801160000_billing_service_role_access.sql`

**This is the one that is NOT purely additive. Read this section before running it.**

It installs the SQL privilege contract for `public.billing`:

```sql
revoke all on table public.billing from public;
revoke all on table public.billing from service_role;
grant  select on table public.billing to service_role;
revoke all on table public.billing from authenticated;
grant  select on table public.billing to authenticated;
revoke all on table public.billing from anon;
```

**Why it exists.** `service_role` needs an explicit `SELECT` on `billing` because three
server-side handlers read the table **directly**, not through an RPC:

| Handler | Columns | What breaks without the grant |
|---|---|---|
| `api/create-checkout-session.ts` | `stripe_customer_id, stripe_subscription_id, subscription_status` | the duplicate-subscription guard returns `500 billing_lookup_failed`; **nobody can buy anything** |
| `api/create-portal-session.ts` | `stripe_customer_id` | `500 billing_lookup_failed`; a paying customer cannot reach the portal to manage or **cancel** |
| `api/_lib/entitlement.ts` (`resolveServerPlan`) | `plan` | the error is swallowed and the caller falls back, so **a paying Pro user is silently served as Free** — no error, no alert |

**RLS BYPASS AND TABLE PRIVILEGES ARE DIFFERENT CONTROLS.** This is the whole reason the gap
existed. `service_role` is `BYPASSRLS`, and every comment in the repo saying "the webhook uses the
service-role key, which bypasses RLS" is true — and irrelevant. `BYPASSRLS` decides which **rows**
a role sees once it is allowed to touch the table; whether it may touch the table at all is a
`GRANT`. There was no `GRANT` on `billing` anywhere in this repository. What access existed came
from Supabase's `ALTER DEFAULT PRIVILEGES`, and `supabase/config.toml` records that the implicit
default for `auto_expose_new_tables` **flipped to `false` on 2026-05-30** and the setting
disappears entirely on 2026-10-30. A fully local Supabase stack in CI answered the checkout guard's
own SELECT with `42501 permission denied for table billing`.

**Direct billing writes stay RPC-controlled, deliberately.** `service_role` gets `SELECT` and
nothing else — no `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` or `TRIGGER`. Every write
goes through `apply_stripe_billing_event`, `bind_verified_checkout` or
`apply_stripe_subscription_event`, which own the event ordering, the downgrade rules and the
`select … for update` lock. A direct write grant would be a second, unreviewed path around all of
it. There is no `.insert()`, `.update()`, `.upsert()` or `.delete()` against `billing` anywhere in
the application.

**What changes on the live database.** Two privileges that exist today are removed. Neither is
used, so neither changes behaviour:

- **`anon` loses `SELECT`.** An anonymous `select * from billing` used to answer `200 []` (the
  select-own policy matching no row) and will now answer a permission error. Nothing in the app
  makes that request — `usePlan()` is disabled until there is a user — so the only thing affected
  is the live-probe recipe in `CLAUDE.md` §7, which changes answer accordingly.
- **`anon` and `authenticated` lose `INSERT`/`UPDATE`/`DELETE`.** `billing` has a SELECT-own policy
  and no write policy of any kind, so RLS already refused all of these. This removes the surface
  underneath RLS rather than relying on RLS alone.

**What must NOT change: the authenticated self-read.** `src/features/billing/usePlan.ts` and the
settings data export (`src/features/settings/exportData.ts`) both read the signed-in user's own
`billing` row through PostgREST. That read is legitimate and it ships today, so the migration grants
`authenticated` an explicit `SELECT` rather than leaving it resting on the same platform default
that just failed for `service_role`. `db-tests/permissions.postgrest.test.ts` proves the self-read
still works against a real stack, and that user B still cannot see user A's row.

Confirm it landed:

```sql
select coalesce(nullif(a.grantee::regrole::text,'-'),'PUBLIC') as grantee, a.privilege_type
  from pg_class c
  left join lateral aclexplode(c.relacl) a on true
 where c.oid = 'public.billing'::regclass and a.grantee <> c.relowner
 order by 1,2;
-- expect exactly two rows: authenticated | SELECT   and   service_role | SELECT
```

> **The privilege contract is executable, not a claim in a document.**
> `db-tests/permissions.db.test.ts` states the whole matrix (4 roles x 7 privileges) and reads the
> installed ACL back from the catalog; `db-tests/billingGrant.db.test.ts` applies the chain only as
> far as `20260801150000`, checks the SELECT is genuinely absent, applies `20260801160000` alone and
> checks it appears — so "the migration grants it" is proved rather than assumed.

### 1.4 — `20260801170000_application_data_api_grants.sql`

**The same defect as §1.3, for the other twenty-two tables. Read before running.**

`20260801160000` fixed `billing` because that is where the failure was caught. It
is not where the failure ends. **No migration in this repository has ever granted
a table privilege to `anon` or `authenticated`.** The live project works only
because it was provisioned while Supabase still handed out a blanket default; the
CI diagnostic prints what the platform gives now:

```
for postgres, in public, tables:
  {postgres=arwdDxtm/postgres, anon=Dxtm/postgres,
   authenticated=Dxtm/postgres, service_role=Dxtm/postgres}
```

`D`=TRUNCATE, `x`=REFERENCES, `t`=TRIGGER, `m`=MAINTAIN. `SELECT`, `INSERT`,
`UPDATE` and `DELETE` are absent for all three Data API roles. A project created
from this chain today — a staging environment, a disaster-recovery restore, a
second region — comes up unable to read anything, and **it fails silently**:
every feature hook treats a `42501` as an empty result, so the symptom is an
empty Vision page, an empty journal, a Free badge for a paying subscriber and a
capacity meter quietly reset to six hours.

**What it installs.** Per-table `REVOKE` from all four roles, then a `GRANT` of
exactly the operations a production call site performs. Four privileges are
refused on purpose even though an RLS policy would allow them, because nothing in
the product uses them: `workspaces` UPDATE/DELETE, `workspace_members`
UPDATE/DELETE, `projects` DELETE (the product archives), and `calendar_sources`
UPDATE. `anon` receives INSERT on `upgrade_intents` and `feature_intents` and
nothing else, because those two fake doors are the only surfaces a logged-out
visitor legitimately writes.

**What it deliberately does NOT do**, each for a reason worth keeping:

- **No function privileges.** Pairing this with a blanket
  `revoke execute on all functions in schema public from public` would take the
  whole product down in one statement: PostgreSQL evaluates an RLS policy as the
  QUERYING role, and `is_workspace_member` / `can_access_project` and friends have
  no explicit EXECUTE grant anywhere — PUBLIC's implicit default is what makes
  every policy in the app evaluable.
- **Nothing outside schema `public`.** No grant on `storage.objects`: it is owned
  by `supabase_storage_admin` and the migration would abort with
  `must be owner of table objects`. Storage authorisation is the four bucket
  policies from `20260731140000`.

**What changes on the live database.** `anon` loses SELECT everywhere (anonymous
reads answered `200 []` through RLS and now answer `42501`; nothing in the app
makes one), and `anon`/`authenticated` lose the write privileges RLS already
refused. Nothing the application does is removed — and that is not an assurance,
it is `db-tests/freshProject.smoke.test.ts`, which signs real users up through
GoTrue and drives every flow through PostgREST on a stack built from nothing but
these migrations.

Confirm it landed:

```sql
-- Expect exactly the contract: no PUBLIC row, no anon row except the two
-- intake tables, and no service_role row except billing and calendar_sources.
select c.relname,
       coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC') as grantee,
       string_agg(a.privilege_type, ', ' order by a.privilege_type) as privileges
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join lateral aclexplode(c.relacl) a on true
 where n.nspname = 'public' and c.relkind = 'r' and a.grantee <> c.relowner
 group by 1, 2
 order by 1, 2;

-- And the app still works for a real user: sign in and confirm the capacity
-- meter shows YOUR number rather than the 360-minute default, Today lists your
-- tasks, and /journal opens an existing entry. Those three are the surfaces
-- whose failure mode is silence.
```

---

## 2. Create the live product and prices

Stripe dashboard with the **test-mode toggle OFF**.

1. **Products → Add product.** Name it what customers should see.
2. Add **two recurring prices**: one **monthly**, one **yearly**.
3. Copy both price ids — they look like `price_1QAbCdEfGhIjKlMn`.

> Live and test price ids are different objects. A test price id in a live deployment gives
> `400 invalid_price` on every checkout, with `rejected a price this deployment does not sell`
> in the log.

---

## 3. The seven environment variables

> **It used to be six, then seven, and is now eight.** FLAG-2 and FLAG-4 added
> `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` and `APP_BASE_URL`; the money-path review added
> **`STRIPE_MODE`**.
>
> ### `STRIPE_MODE` is checked against everything else, and disagreement fails closed
>
> Mode used to be inferred wherever it happened to be needed, which means it could be inferred
> differently in two places and a half-live deployment would look fine until money moved. It is
> now declared once and cross-checked against: the secret key prefix, the publishable key prefix,
> the client/server price-id pairs, and the `livemode` flag on every Stripe object and webhook
> event the server touches.
>
> Consequences worth knowing before the switch:
> - a **test** webhook event cannot modify **live** billing state, and vice versa — the event is
>   acknowledged `200 {"skipped":"livemode_mismatch"}` and nothing is written;
> - an inconsistent deployment refuses to sell (`503 billing_misconfigured`) rather than guessing
>   which half is right, and in particular **never downgrades an existing payer** because a
>   config error made their subscription look foreign;
> - it is deliberately **not** inferred from `whsec_`, which does not encode mode.

Vercel → project → **Settings → Environment Variables**, scope **Production**.

### Server-only — never prefixed `VITE_`, never committed

| Name | Where the value comes from | If absent |
|---|---|---|
| `STRIPE_MODE` | Literally `test` or `live`. The ONE declaration of intent. | `503 billing_not_configured` |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → **Secret key** (live), `sk_live_…` | `503 billing_not_configured` |
| `STRIPE_WEBHOOK_SECRET` | §5 below, `whsec_…` | webhook `503 not_configured` |
| `STRIPE_PRICE_MONTHLY` | §2 — the **live** monthly price id | `503`; checkout sells nothing |
| `STRIPE_PRICE_YEARLY` | §2 — the **live** yearly price id | as above |
| `SUPABASE_URL` | `https://lplsbfduankkpglyusjp.supabase.co` | `503 not_configured` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → **service_role** | `503 not_configured` |
| `APP_BASE_URL` | `https://www.todonado.com` | *optional* — defaults to exactly that |

### Browser — build-time, public, safe in the bundle

| Name | Value |
|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe → API keys → **Publishable key** (live), `pk_live_…` |
| `VITE_STRIPE_PRICE_MONTHLY` | **the same string as** `STRIPE_PRICE_MONTHLY` |
| `VITE_STRIPE_PRICE_YEARLY` | **the same string as** `STRIPE_PRICE_YEARLY` |

> ### The one mistake this setup invites
>
> **The price ids are declared twice, and the two copies must be identical.** The browser needs
> them at build time to know what to ask for; the server needs them at run time to decide what it
> is willing to sell — and it must not read the client's copy, because that is precisely the
> trust the FLAG-2 fix removed.
>
> If they disagree, **every checkout returns `400 invalid_price`** and the log says `rejected a
> price this deployment does not sell`. Nothing else misbehaves, which is what makes it
> confusing. Paste all four from the same clipboard, once.

`APP_BASE_URL` is validated rather than trusted: https only (except `http://localhost`), no
embedded credentials, reduced to its origin. Anything unusable is ignored in favour of
`https://www.todonado.com` **and logged** — grep the deploy for `APP_BASE_URL is not a usable
https origin`.

---

## 4. Redeploy

`VITE_*` values are baked in at **build** time, so setting them is not enough — and it must be a
**fresh build**, not a promotion.

Vercel → Deployments → ⋯ → **Redeploy**, with *Use existing Build Cache* **OFF**.

---

## 5. Create the live webhook endpoint

Stripe, still in live mode: **Developers → Webhooks → Add endpoint**.

- **URL:** `https://www.todonado.com/api/stripe-webhook`
- **Events** — exactly these three, which are all the handler acts on:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Reveal the **Signing secret** (`whsec_…`), set it as `STRIPE_WEBHOOK_SECRET`, then **redeploy
  again**.

> The test endpoint has its own separate signing secret. Copying that one into live production
> makes every real event fail with `400 invalid_signature`.

Send a test event from the dashboard; expect `200 {"received":true}`.

---

## 6. Grant founding access properly (do it now, while you are here)

Founding Pro is granted by matching an email string in `src/features/billing/planCore.ts`. That
is a stopgap — email is self-service, so the list is data a stranger could in principle claim
(audit FLAG-8). It is now guarded (the address must be **verified**, and `+tag` / dotted aliases
are refused), but the durable fix is a row:

```sql
insert into public.billing (user_id, plan, subscription_status)
select id, 'pro', 'founding' from auth.users
where email in ('journeypixofficial@gmail.com', 'ahmedkassim17777@gmail.com')
on conflict (user_id) do update set plan = 'pro';
```

`billing` has no client write path (SELECT-own RLS, service-role writes only), so a row there is
data the user cannot set — which is exactly what an email string is not. Once every founding
account has one, empty `FOUNDING_EMAILS`: `resolveEffectivePlan` already prefers a real billing
row, so the switch is invisible to anyone holding one.

---

## 7. POST-SWITCH VERIFICATION — with a real card

Do the whole sequence in one sitting. Each step says how to confirm it **in Stripe** *and* **in
the app**, because either alone can lie: Stripe can take the money while the webhook fails, and
the app can show Pro from a stale cache.

Have open: the app signed in as a **throwaway account** — *not* a founding email, those are Pro
regardless and would prove nothing — plus Stripe → Payments and Vercel → Logs.

### 7.1 Subscribe

| | Check |
|---|---|
| **Do** | Settings → Plan → Upgrade → monthly. Pay with a real card. |
| **Stripe** | Payments: one succeeded payment. Customers: **one** customer. Subscriptions: **one** active subscription on your live monthly price. |
| **App** | Lands on `/settings/plan?checkout=success` **at www.todonado.com**. Anywhere else → stop, check `APP_BASE_URL`. |
| **Logs** | `/api/stripe-webhook` → `200`. No `REFUSING to grant Pro`, no `billing_schema_outdated`. |
| **DB** | `select plan, subscription_status, last_stripe_event_id, last_stripe_event_at from billing where user_id = '<id>';` → `pro`, `active`, **both event columns populated**. Null event columns mean §1 did not land. |

### 7.2 Pro actually unlocks

Reload once, then confirm **all** of: `/week` shows your real week (not the sample), `/insights`
loads, history reaches past 14 days, the journal offers voice recording, and a calendar **URL**
source syncs. These are the real `usePlan()` gates — a badge is not evidence.

### 7.3 The duplicate-subscription guard

Press Upgrade again. Expect **"You're already subscribed"** and **no second subscription** in
Stripe. That is FLAG-14. If a second one appears, stop.

### 7.4 Cancel in the portal

| | Check |
|---|---|
| **Do** | Settings → Plan → Manage subscription → cancel. |
| **Stripe** | Subscription reads `canceled` (or cancels at period end, per your portal config). |
| **App** | Returns to `/settings/plan` **at www.todonado.com**; plan reads **Free** after a reload. |
| **Logs** | webhook `200`. |
| **DB** | `plan = 'free'`, and `last_stripe_event_at` has **moved forward**. |

> With "cancel at period end" configured, the plan correctly stays Pro until the period ends. To
> see the downgrade immediately, cancel **immediately** from the Stripe dashboard instead.

### 7.5 Refund

Stripe → Payments → the payment → **Refund**. Confirm it lands. A refund does not by itself
change the subscription, so plan state stays whatever 7.4 left it — that is expected, not a bug.

### 7.6 The ordering guard, if you want to watch it work

Stripe → Webhooks → your endpoint → pick the **older** `customer.subscription.deleted` →
**Resend**. Expect `200 {"received":true,"skipped":"stale_event"}` (or `duplicate_event`) and
**no change** to the billing row. Before FLAG-3 this silently downgraded a paying customer.

---

## 8. ROLLBACK — it went wrong halfway

**Nothing here loses money or data.** Stripe retries failed webhooks for ~3 days, so events queue
rather than drop, and the migration is additive.

| Symptom | Cause | Fix |
|---|---|---|
| Every checkout `400 invalid_price` | `VITE_STRIPE_PRICE_*` ≠ `STRIPE_PRICE_*`, or a test price in live | Repaste all four from one clipboard, redeploy **without** build cache |
| Checkout `503` naming vars | one is unset, or scoped to the wrong environment | Set it for **Production**, redeploy |
| Webhook `400 invalid_signature` | test signing secret in live | Copy the **live** endpoint's secret, redeploy |
| Webhook `503 billing_schema_outdated` | §1 skipped | Run the migration, then Webhooks → **Resend** the failed events |
| Webhook `200` but plan stays Free | look for `REFUSING to grant Pro` | Purchased price is not in `STRIPE_PRICE_*`. Fix, redeploy, resend |
| Returned to the wrong domain | `APP_BASE_URL` wrong/unusable | Check logs for `APP_BASE_URL is not a usable https origin` |
| **Stop selling RIGHT NOW** | — | **Delete `STRIPE_SECRET_KEY` and redeploy.** Checkout `503`s, the UI falls back to the fake-door modal, existing subscribers keep working. This is the kill switch. |

**Full retreat to test mode:** swap all seven vars back to test values, redeploy without cache,
disable or re-point the live webhook endpoint. The migrations stay (see 8.5 — the privilege ones
are safe to keep and the billing ones must not be reversed). Refund anything real taken meanwhile.

### 8.1 — Application deployment

Vercel → Deployments → the last known-good build → **Promote to Production**.
Instant, reversible, and independent of everything below: the database, the
Stripe keys and the webhook endpoint are all unchanged by it. Do this FIRST if
you do not yet know which layer is broken — it is the only rollback with no
consequences.

### 8.2 — Stripe keys

Swap `STRIPE_MODE`, `STRIPE_SECRET_KEY` and `VITE_STRIPE_PUBLISHABLE_KEY` back to
their test values **together**, and redeploy without build cache. Never half:
`stripeModeProblems()` refuses to sell on any inconsistency, which is the
intended outcome but reads as an outage. Existing live subscriptions are NOT
cancelled by this — they simply stop being reachable from this deployment.

### 8.3 — Webhook endpoint

Stripe → Developers → Webhooks → **disable** the live endpoint (do not delete it:
deleting loses the delivery history you will want). Events queue for ~3 days, so
re-enabling and using **Resend** recovers everything. If you rotate the signing
secret, update `STRIPE_WEBHOOK_SECRET` and redeploy in the same sitting — a
deployment with the old secret answers `400 invalid_signature` to every delivery.

### 8.4 — Price configuration

Archive the live prices in Stripe rather than deleting them; a deleted price
breaks the subscription that references it. Then repoint `STRIPE_PRICE_*` and
`VITE_STRIPE_PRICE_*` — **all four from one clipboard** — and redeploy without
cache. Anyone already subscribed keeps the price they bought.

### 8.5 — The privilege migrations (20260801160000, 20260801170000)

These are the only two that are genuinely reversible, and reversing them is
**widening access**, so it needs a decision rather than a reflex.

If the app breaks in a way you can trace to a `42501`, the correct fix is a NEW
migration granting the specific privilege the specific call site needs — not a
blanket re-widening. The emergency escape hatch, if you truly need the app back
before you can diagnose it:

```sql
-- EMERGENCY ONLY. This restores the pre-migration blanket grant on ONE table.
-- Record which table and why, and replace it with a narrow grant the same week.
grant select, insert, update, delete on table public.<table> to authenticated;
```

Do **not** re-run the platform's old
`alter default privileges … grant all … to anon, authenticated, service_role`.
That is the setting Supabase is removing, it grants on every FUTURE table too,
and it is how `billing` ended up one `42501` away from unsellable.

### 8.6 — Billing state

**Do not reverse `20260801140000` or `20260801150000` after real webhook events
have been processed.** Dropping `last_stripe_event_id` / `last_stripe_event_at`
throws away the high-water mark, and the next Stripe redelivery — which is a
routine event, not an incident — is then applied blind. That is exactly audit
FLAG-3, and it downgrades paying customers. Dropping `checkout_attempts` destroys
the binding between a Stripe subscription and a user, after which
`apply_stripe_subscription_event` answers `unknown_subscription` for every
lifecycle event and no renewal or cancellation is ever recorded.

If a specific row is wrong, fix THAT row through the reviewed path
(`apply_stripe_billing_event`) and record why. A wrong plan on one account is a
support ticket; a missing ordering column is a silent revenue bug across the
whole customer base.

---

## 9. What each API error code means

| Code | Status | Meaning |
|---|---|---|
| `unauthorized` | 401 | No/invalid Supabase JWT |
| `missing_price_id` | 400 | Empty or unparseable body |
| `invalid_price` | 400 | Malformed — **or well-formed and not one we sell** (FLAG-2) |
| `already_subscribed` | 409 | A live subscription exists; use the portal (FLAG-14) |
| `rate_limited` | 429 | 10/min billing, 6/min calendar, per user (FLAG-10) |
| `no_subscription` | 400 | Portal opened with no Stripe customer |
| `billing_not_configured` | 503 | Env vars missing; named for signed-in callers only |
| `not_configured` | 503 | Same, to an anonymous caller — deliberately unnamed |
| `missing_signature` / `invalid_signature` | 400 | Webhook signature absent or wrong |
| `billing_schema_outdated` | 503 | §1 migration not applied; the webhook refuses to write |
| `billing_read_failed` | 500 | Billing row unreadable |
| `stripe_error` | 502 | Stripe refused. The real reason is in the logs, never the response |

The webhook also answers `200` with a `skipped` reason — `stale_event`, `duplicate_event`,
`stale_downgrade`, `downgrade_for_other_subscription`, `unrecognised_price`, `superseded`,
`insert_race`. Those are **successes**: the event was understood and deliberately not applied. A
non-2xx would make Stripe retry a decision we made on purpose.

---

## 10. Two failure modes that were real outages (kept from the original)

### A bare 500 with `x-vercel-error: FUNCTION_INVOCATION_FAILED`

A relative import in `api/` is missing its `.js` extension. `package.json` is `"type": "module"`
and Node's ESM resolver does no extension guessing, so it throws at module load — before any
handler code runs, which is why the error boundary cannot catch it.
`api/moduleContract.test.ts` fails on this now, so it should not reach production again.

### A request that HANGS — connects, zero bytes, no error, no log

A handler exported a Web-shaped `(req) => Response` where Vercel invokes the legacy `(req, res)`
Node contract, so nothing ever wrote to `res`. Every handler now exports both, and
`api/handlers.test.ts` asserts the default export has arity 2.

---

## 11. Renewal, refunds and disputes — what is and is not automated

Documented rather than built, so nobody assumes coverage that does not exist. Only
`checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`
are handled; every other event type is acknowledged with `skipped: unhandled_event_type`.

| Situation | What Stripe emits | What Todonado does | Classification |
|---|---|---|---|
| Card fails, Stripe retries | subscription → `past_due` (via `customer.subscription.updated`) | **Automatic.** Access is KEPT during dunning. | working as intended |
| Retries exhausted | subscription → `unpaid` or `canceled`, per your Stripe dunning setting | **Automatic**, provided the setting moves the SUBSCRIPTION. Access is revoked. | see the warning below |
| Customer cancels in the portal | `customer.subscription.updated` then `deleted` | **Automatic.** Access returns to Free. | working as intended |
| Subscription paused | subscription → `paused` | **Automatic.** Access revoked (`paused` is Free). | working as intended |
| **Refund** | `charge.refunded` — **not** a subscription event | **NOTHING.** A refund alone does not change access. | **accepted manual process** |
| **Dispute / chargeback** | `charge.dispute.created` | **NOTHING.** | **accepted manual process** |

> ### The dunning setting is load-bearing
>
> Because `invoice.*` is ignored, access after a failed renewal changes **only** if your Stripe
> retry settings end by changing the subscription's status. In the Stripe dashboard, under
> **Settings → Billing → Subscriptions and emails → Manage failed payments**, the behaviour after
> all retries must be **Cancel the subscription** or **Mark the subscription as unpaid**. If it is
> set to **Leave the subscription as is**, a subscriber who stops paying keeps Pro indefinitely and
> nothing in this codebase will notice. Verify this before going live.

> ### Refunds and disputes are a manual process, on purpose for launch
>
> Neither revokes access automatically. To revoke after a refund or a chargeback, **cancel the
> subscription in Stripe** — that emits `customer.subscription.deleted`, which the webhook does
> handle, and access returns to Free within seconds. Automating it means handling
> `charge.refunded` and `charge.dispute.created`, mapping a charge back to a subscription, and
> deciding whether a partial refund should revoke anything. That is a real feature, not a
> one-liner, and it is **post-launch** work rather than a launch blocker: the manual path exists,
> takes one click, and at launch volume it is tractable.

