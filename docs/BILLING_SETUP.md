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
- The `/api/*` endpoints answer **503 `billing_not_configured`** if hit directly,
  listing the missing variable NAMES (see the error table below).
- `usePlan()` still works: the `billing` query degrades to "no row" if the table
  isn't applied, so plan resolves via founding-email → dev preview → free.
- **CI stays green with zero secrets** — the E2E exercises this fallback path.

---

## Troubleshooting — what each API error means

Every billing endpoint returns a **stable JSON error code**. Values are never
included; a 503 lists missing env var **names** only.

| HTTP | `error`                  | Meaning / fix |
| ---- | ------------------------ | ------------- |
| 405  | `method_not_allowed`     | Not a POST. |
| 503  | `billing_not_configured` | `missing: [...]` names the absent Vercel env vars. Set them in **Production** scope, then **redeploy**. |
| 401  | `unauthorized`           | Missing/invalid `Authorization: Bearer <supabase jwt>`. |
| 400  | `missing_price_id`       | Body had no `priceId` — usually `VITE_STRIPE_PRICE_*` was not baked into the client build. |
| 400  | `invalid_price`          | `priceId` is not a `price_…` id. Never forwarded to Stripe. |
| 400  | `no_subscription`        | Portal: the user has no `stripe_customer_id` yet. |
| 400  | `missing_signature` / `invalid_signature` | Webhook: absent or unverifiable `stripe-signature`. Check `STRIPE_WEBHOOK_SECRET` matches the endpoint. |
| 502  | `stripe_error`           | Stripe rejected the call; `message` is upstream's, with any key redacted. |
| 500  | `billing_lookup_failed` / `billing_upsert_failed` | The service-role DB read/write failed. |
| 500  | `internal_error`         | Caught by the top-level boundary. The real message is in the Vercel function log, redacted. |

### If you get a bare 500 with `x-vercel-error: FUNCTION_INVOCATION_FAILED`

That is **not** one of the codes above — it is the platform reporting that the
function crashed *before* the handler ran, so no try/catch inside the handler can
catch it. It hits **every** request, including a plain `GET`, which is the tell.

The cause we hit in production (2026-07-25): package.json is `"type": "module"`,
so `api/*.ts` runs as **ESM**, and Node's ESM resolver does **no extension
guessing** — an extensionless relative import (`./_lib/config`) throws
`ERR_MODULE_NOT_FOUND` at module load and takes the whole endpoint down.

**All relative imports inside `api/` must end in `.js`** (TypeScript maps
`./_lib/config.js` → `_lib/config.ts`). This is now enforced two ways:
`tsconfig.api.json` (`moduleResolution: NodeNext`) makes it a compile error, and
`api/moduleContract.test.ts` asserts it. Both run in CI.

### If a request HANGS (connects, then zero bytes, no error, no log)

Different bug, same day — and nastier, because nothing is logged anywhere.

This project's Vercel Node runtime invokes functions with the **legacy
signature** `(req: IncomingMessage, res: ServerResponse)` — confirmed in
production, which reported `contract: "node", argc: 2,
firstArgCtor: "IncomingMessage"`. A handler written Web-style
(`(req: Request) => Response`) therefore has its **return value discarded**:
nothing is ever written to `res`, so the connection stays open until it dies.

The handlers stay Web-shaped (runtime-agnostic and easy to unit-test) and
`api/_lib/nodeAdapter.ts` bridges them:

```ts
export const webHandler = withErrorBoundary(myHandler)  // testable with Requests
export default toNodeHandler(webHandler)                // what Vercel invokes
```

`handlers.test.ts` asserts every default export has **arity 2**, so reverting to
a 1-arg Web handler fails CI.

**Raw body:** the adapter reads the untouched request stream, which production
confirmed is still readable on entry (`rawBytesRead === content-length`). That
matters because Stripe signs the exact bytes — the platform *also* pre-parses a
body, and reconstructing from that parsed object would break signature
verification on every webhook.
