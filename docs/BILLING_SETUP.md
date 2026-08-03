# Billing — GO-LIVE runbook

> **Audience:** the owner, in a real terminal, with the Stripe dashboard open.
> **Rewritten 2026-08-01**, after the billing-dependent audit flags were closed.
>
> This replaces the old "paint-by-numbers when the keys arrive" version. That doc assumed test
> mode and left go-live as a four-line afterthought at the end. This one *is* the switch: the
> exact order, where every value comes from, and what to do when it goes wrong halfway.

---

## 0. THE ORDER IS THE RUNBOOK

Every step works if you do it in this order, and fails in a specific, recoverable way if you do
not. Two orderings actually matter:

1. **Apply all three migrations BEFORE setting live keys.** The webhook refuses to write against a
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
| 1 | Apply the **three** pending migrations, in order | your terminal | see §1 — two are additive, one narrows privileges |
| 2 | Create live product + prices | Stripe dashboard | yes |
| 3 | Set the seven env vars | Vercel | yes |
| 4 | Redeploy (no build cache) | Vercel | yes |
| 5 | Create the live webhook endpoint | Stripe dashboard | yes |
| 6 | Set `STRIPE_WEBHOOK_SECRET`, redeploy again | Vercel | yes |
| 7 | Verify with a real card | production | refund |

---

## 1. Apply the migrations — FIRST, before any live key

**THREE files are pending, and the order is chronological.** `supabase db push` applies them in
this order by itself; the list is here so you can check what landed, and run them by hand if you
prefer.

| # | File | What it does |
|---|---|---|
| 1 | `20260801140000_billing_event_ordering.sql` | two nullable columns on `billing` + `apply_stripe_billing_event` |
| 2 | `20260801150000_checkout_attempts.sql` | the `checkout_attempts` table and the reserve/mark/bind functions |
| 3 | `20260801160000_billing_service_role_access.sql` | the SQL privilege contract for `billing` |

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
disable or re-point the live webhook endpoint. The migration stays — additive and harmless in
either mode. Refund anything real taken meanwhile.

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

