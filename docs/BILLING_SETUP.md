# Billing setup — paint-by-numbers (when the Stripe keys arrive)

The full billing stack is **already built and merged**. Turning it on is **pure
configuration — no code changes.** Until you complete these steps the app runs
exactly as before: the "Upgrade" button on **My Plan** falls back to the
fake-door interest form, and nothing charges.

Do this in **Stripe TEST mode first**. Go-live (live keys) is step 5.

> **Never commit or paste real keys** into the repo, chat, or a client-side
> (`VITE_`) var except the two that are *meant* to be public (publishable key +
> price IDs). The **secret key, webhook secret, and service-role key are
> server-only** — they live only in Vercel env vars.

---

## What was built (for reference)

- **Serverless endpoints** (`/api`, auto-deployed by Vercel with the SPA):
  - `POST /api/create-checkout-session` — verifies the caller's Supabase JWT →
    Stripe Checkout (subscription), stamps `user_id` on the session + subscription.
  - `POST /api/create-portal-session` — JWT → Stripe Customer Portal (manage/cancel).
  - `POST /api/stripe-webhook` — raw-body signature verify → upserts the `billing`
    row via the **service-role** key (bypasses RLS). Idempotent; unknown events → 200.
- **`billing` table** — `plan` gate lives here (not on `profiles`), **SELECT-own
  only, no client writes** → a user can never self-upgrade.
- **Client** — `usePlan()` reads the billing row; `/settings/plan` shows real
  Upgrade/Manage when configured, else the fake-door. Config gate:
  `isBillingConfigured()` (`src/features/billing/stripeConfig.ts`).

---

## Step 1 — Create Stripe products/prices and collect the keys

In the **Stripe Dashboard (Test mode)**:

1. **Products** → add product **"Todonado Pro"** → add **two prices**:
   a **monthly** recurring price and a **yearly** recurring price. Copy each
   **Price ID** (`price_...`).
2. **Developers → API keys** → copy the **Publishable key** (`pk_test_...`) and
   **Secret key** (`sk_test_...`).

You now have: `pk_test_...`, `sk_test_...`, `price_...monthly`, `price_...yearly`.

## Step 2 — Paste env vars into Vercel and redeploy

**Vercel → Project → Settings → Environment Variables.** Add these (Production,
and Preview if you test there), then **redeploy** so the client picks up the
`VITE_` values (they are build-time).

**Client (public — safe in the browser bundle):**

| Var | Value |
| --- | --- |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` |
| `VITE_STRIPE_PRICE_MONTHLY`   | `price_...` (monthly) |
| `VITE_STRIPE_PRICE_YEARLY`    | `price_...` (yearly) |

**Server (secret — Vercel only, never `VITE_`, never committed):**

| Var | Value |
| --- | --- |
| `STRIPE_SECRET_KEY`          | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET`      | `whsec_...` (from step 3) |
| `SUPABASE_URL`              | `https://lplsbfduankkpglyusjp.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role key (see box below) |

> **Where the service-role key lives:** Supabase Dashboard → **Project Settings
> → API → Project API keys → `service_role`** (the "secret" one, *not* the
> `anon` key). It bypasses RLS. Put it **only** in Vercel's server env — never in
> the repo, a `VITE_` var, or chat.

You can set `STRIPE_WEBHOOK_SECRET` now as a placeholder and fill its real value
after step 3, then redeploy once more.

## Step 3 — Create the Stripe webhook endpoint

**Stripe Dashboard → Developers → Webhooks → Add endpoint:**

1. **Endpoint URL:** `https://www.todonado.com/api/stripe-webhook`
2. **Events to send** — select exactly these three:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. Create it, then **reveal the Signing secret** (`whsec_...`) and paste it into
   Vercel as `STRIPE_WEBHOOK_SECRET`. **Redeploy.**

## Step 4 — Apply the billing migration

The migration is committed but **NOT yet applied** to the cloud DB. In a real
terminal (you link via `SUPABASE_ACCESS_TOKEN`):

```
supabase db push        # applies supabase/migrations/20260706130000_billing.sql
```

Verify: `select * from public.billing;` runs (empty), and an anonymous client
gets **no write access** (RLS SELECT-own only).

## Step 5 — Test-mode end-to-end (the real flow)

On `https://www.todonado.com`, signed in as a **non-founding** test account
(founders read as Pro regardless, so use a normal account):

1. **My Plan → Upgrade — Monthly** (or Yearly) → you're redirected to Stripe Checkout.
2. Pay with the Stripe test card **`4242 4242 4242 4242`**, any future expiry, any
   CVC/ZIP.
3. You return to `/settings/plan?checkout=success` → an **"Activating…"** state →
   within a few seconds the webhook lands and the plan flips to **Pro** (badge +
   feature checks). *(If it stays "activating", check the webhook's delivery log in
   Stripe and that `STRIPE_WEBHOOK_SECRET` matches.)*
4. **Manage subscription** → Stripe Customer Portal → **Cancel** → back in the app
   the plan returns to **Free** (after the `customer.subscription.deleted` /
   `updated` webhook). Confirm the `billing` row shows `plan='free'`.

## Step 6 — Go live (later)

1. Flip the Stripe Dashboard to **Live mode**; create the live product/prices.
2. Swap every Vercel var to the **live** equivalents: `pk_live_...`, `sk_live_...`,
   live `price_...` IDs, and a **new live webhook endpoint** (same URL + 3 events)
   with its own `whsec_...`.
3. Redeploy. Do one real (or `$0` coupon) end-to-end pass.
4. Ensure custom SMTP is live (billing emails come from Stripe, but account emails
   still use Supabase — see `docs/LAUNCH_CHECKLIST.md`).

---

## Fallback behavior (before any of the above)

With **no Stripe env vars set**, `isBillingConfigured()` is `false` everywhere:
- **My Plan** shows the original fake-door "Upgrade to Pro" → interest form.
- The `/api/*` endpoints answer **503 "Billing is not configured"** if hit directly.
- `usePlan()` still works: the `billing` query degrades to "no row" if the table
  isn't applied, so plan resolves via founding-email → dev preview → free.
- **CI stays green with zero secrets** — the E2E exercises this fallback path.
