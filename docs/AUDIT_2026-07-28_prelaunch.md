# Security audit — pre-launch, 2026-07-28

Adversarial, evidence-based audit of Todonado in its **current** state, run against the
**live** cloud Supabase (`lplsbfduankkpglyusjp`) and the **live** production deployment
(`https://www.todonado.com`) at commit `9585571`.

Every claim below is tagged **FACT** (directly observed in a response I captured) or
**INFERENCE** (reasoned from code/versions, not directly exploited).

**Verdict: no Critical and no High findings. Nothing here blocks launch.** The
data layer is genuinely solid — 79 live RLS probes, zero failures, including a
dedicated attempt to forge a paid plan. The gaps that remain are perimeter
hardening (HTTP security headers) and one unauthenticated-write surface that is
working exactly as designed but has no abuse control.

---

## 1. Method

| Probe | Scope |
| --- | --- |
| RLS sweep | 15 tables × {anon select, anon insert}, two live throwaway accounts for cross-user attempts, 7 billing-forgery attempts, RPC surface |
| API | 3 production endpoints × {GET, unauthenticated POST, malformed input}, 3 webhook signature cases |
| Bundle | 113 local `dist/` files (1.00 MB) + 108 production chunks (993 kB), transitively crawled |
| Headers | 3 production paths |
| Static | XSS-sink grep over all of `src/`, `npm audit`, service-worker inspection |

**Throwaway accounts self-cleaned.** Both audit accounts were deleted via the
`delete_own_account` RPC (`HTTP 204` each) and the sweep exits non-zero if cleanup
fails. No residue in `auth.users`.

> **Disclosure — 6 junk rows I created.** Proving the insert-only fake doors accept an
> anonymous write means actually writing. I inserted 6 rows tagged `source='audit'`
> across `upgrade_intents`, `feature_intents` and `events`. Those tables have **no
> delete policy** by design, so I could not remove them via the API. Clean up in the
> SQL editor when convenient:
> ```sql
> delete from public.upgrade_intents where source = 'audit';
> delete from public.feature_intents where source = 'audit';
> delete from public.events          where source = 'audit';
> ```

---

## 2. Findings

### MEDIUM

#### M1 — Production serves almost no security headers · FACT
> **STATUS: RESOLVED (2026-07-28).** The block in §4 was approved and applied to
> `vercel.json` — both the five safe headers and the CSP in Report-Only. The Vite
> dev/preview server now reads the same file, so dev and production cannot drift,
> and two test layers lock it in: `src/test/securityHeaders.test.ts` (values +
> "CSP must still be Report-Only") and an E2E that asserts the headers are
> actually served. The findings below describe the state at audit time.

Only `Strict-Transport-Security` was present. Observed on `/`, `/welcome`, and
`/api/stripe-webhook`:

```
[present] strict-transport-security = max-age=63072000
[MISSING] content-security-policy
[MISSING] x-frame-options
[MISSING] x-content-type-options
[MISSING] referrer-policy
[MISSING] permissions-policy
[MISSING] cross-origin-opener-policy
```

`vercel.json` contains only a rewrite rule — no `headers` block at all.

**Impact.** No `X-Frame-Options`/`frame-ancestors` means the app can be framed
(clickjacking against destructive flows — the delete-account confirm is the obvious
target). No `X-Content-Type-Options` allows MIME sniffing. No `Referrer-Policy` leaks
full URLs to third parties. No CSP means an injected script would face no second line
of defence — though note there is currently **no known injection vector** (see §3).

**Originally FLAGGED, not applied** — since CSP can break a running app. The block
is in §4, split deliberately: the five non-breaking headers go live immediately;
CSP starts in **Report-Only**. Both parts have since been approved and shipped.

#### M2 — Unauthenticated, unthrottled INSERT into three tables · FACT
`events`, `upgrade_intents` and `feature_intents` accept an anonymous insert with
nothing but the public anon key. Verified live — all three returned `HTTP 201`:

```
[INFO] anon-insert(by design) :: upgrade_intents -> HTTP 201
[INFO] anon-insert(by design) :: feature_intents -> HTTP 201
[INFO] anon-insert(by design) :: events          -> HTTP 201
```

This is **the documented design** (insert-only fake doors + first-party analytics), and
the important half is airtight: attribution cannot be forged, and nobody can read the
tables back.

```
[PASS] anon-forge-attribution   :: upgrade_intents -> HTTP 401 42501
[PASS] anon-forge-attribution   :: feature_intents -> HTTP 401 42501
[PASS] anon-forge-attribution   :: events          -> HTTP 401 42501
[PASS] author-cannot-read-back  :: all three       -> rows=0
```

**Impact.** Anyone who reads the anon key out of the bundle (it is public by design) can
write unbounded rows into these three tables. That is not a data-confidentiality problem
— it is a **data-integrity and cost** problem. `events` is the table the "does the
effort-aware wedge actually work?" measurement depends on; a few thousand forged
`over_capacity_hit` rows would silently poison the only validation signal the product
has, and free-tier storage is finite.

**FLAGGED, not fixed** — mitigating this means changing RLS or moving the writes behind
an edge function, both explicitly off-limits without your call. Options, cheapest first:
1. Enable Supabase's built-in rate limiting on the REST endpoint (config, no schema change).
2. Add Cloudflare Turnstile to the fake-door CTAs (client + a verifying edge function).
3. Move `events` writes behind an authenticated-only policy, accepting the loss of
   logged-out analytics.

#### M3 — Shipped `react-router` is in an open-redirect advisory range · FACT (version) / INFERENCE (exploitability)
`react-router-dom@6.x` resolves into `6.0.0 – 7.17.0`, the range for
[GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) — open redirect
via a backslash in `<Link>`/`useNavigate`. This is the **only** flagged dependency whose
code actually reaches the browser.

**Exploitability here looks low (INFERENCE).** The one place a navigation target comes
from data rather than a literal is `LoginPage.tsx:61`:

```tsx
const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
return <Navigate to={from ?? '/'} replace />
```

`from` is written by `ProtectedRoute` from a router-matched `location`, history state
cannot be set cross-origin, and `AppRoutes`' `*` catch-all normalises every unmatched
path to `/`. I did not find a way to steer it to an external origin. Still worth
patching on principle rather than relying on that chain holding.

**Reported, not fixed** — you asked for `npm audit` to be reported, not blind-fixed.

### LOW

| # | Finding | Evidence |
| --- | --- | --- |
| **L1** | HSTS lacks `includeSubDomains` and `preload` · FACT | `strict-transport-security = max-age=63072000` |
| **L2** | `/api` 502s echo the (redacted) upstream Stripe message in `stripe_error.message` · FACT | `create-checkout-session.ts:66`, `create-portal-session.ts:54`. `redactSecrets()` strips `sk_`/`rk_`/`pk_`/`whsec_`/JWTs first, so this is a small operational-detail leak, not a credential leak. Touches billing → flagged, not changed. |
| **L3** | Build-toolchain advisories: `vitest` (critical), `postcss`/`vite`/`esbuild`/`js-yaml`/`fast-uri`/`brace-expansion` (high/moderate) · FACT | 11 total. **None ship to the browser** — all are dev/build dependencies, so real product risk is low. `npm audit fix` reportedly resolves them without a major bump. |
| **L4** | Unknown paths return `200` + `index.html`, never `404` · FACT | `/service-worker.js` → `content-type: text/html`. Standard SPA-rewrite behaviour from `vercel.json`; noted because it briefly looked like a rogue second service worker during this audit. |
| **L5** | `complete_task` on another user's task returns `500 P0002`, not `403` · FACT | `HTTP 500 {"code":"P0002","message":"Task e83ac55c-43…"}`. The task was **not** modified (`A.status=todo`), and the message is identical for "doesn't exist" and "not yours", so it is **not** an enumeration oracle — the status code is just wrong. Touches an RPC → flagged. |

---

## 3. What was tested and found CLEAN

### RLS — 79 live checks, 0 failures
- **Anonymous read of all 15 tables** → `HTTP 200 rows=0`, every one:
  `profiles, workspaces, workspace_members, projects, sections, tasks, subtasks,
  focus_sessions, wellness_items, wellness_logs, calendar_sources, billing,
  upgrade_intents, feature_intents, events`.
- **Anonymous write to all 12 core tables** → `42501` every one.
- **Cross-user isolation.** User B, holding a valid session, could not touch user A:
  ```
  B-read-A   :: tasks / projects / focus_sessions / wellness_items /
                calendar_sources / wellness_logs / profiles     -> rows=0
  B-unfiltered-scan :: 7 tables    -> total=0 or own-row-only, foreign=0
  B-update-A :: tasks              -> changed=0
  B-delete-A :: tasks              -> deleted=0
  A-row-intact :: tasks            -> title="A secret task"
  B-insert-into-A-workspace        -> 403 42501
  B-self-join-A-workspace          -> 403 42501
  B-steal-A-workspace (owner_id)   -> changed=0
  B-edit-A-profile                 -> changed=0
  B-complete_task-on-A             -> blocked, A.status still 'todo'
  ```
  Note the unfiltered scans: B was allowed to `select *` with no filter and simply
  received **nothing of A's** — isolation is enforced in the database, not by client
  filtering.

### Billing — a user can NEVER write `plan='pro'` · FACT
Seven separate forgery attempts as an authenticated user, all defeated:

```
INSERT own row plan=pro      -> 403 42501
UPSERT own row plan=pro      -> 403 42501
UPDATE own row plan=pro      -> 200 []      (no UPDATE policy: zero rows visible)
UPDATE every row plan=pro    -> 200 []
DELETE own row               -> 200 []
INSERT row for another user  -> 403 42501
PATCH profiles.plan=pro      -> 400 PGRST204 (no such column)
billing-readback             -> 200 []      (still no pro row)
```

The design is the reason this holds: `plan` lives on `billing`, which has a
**SELECT-own policy and no insert/update/delete policy at all**, rather than on
`profiles`, which has a self-update policy. The last probe confirms the alternative
attack path doesn't exist — there is no `plan` column on `profiles` to forge.

### API endpoints · FACT
```
GET  /api/create-checkout-session -> 405 {"error":"method_not_allowed"}
GET  /api/create-portal-session   -> 405 {"error":"method_not_allowed"}
GET  /api/stripe-webhook          -> 405 {"error":"method_not_allowed"}
POST /api/create-checkout-session -> 401 {"error":"unauthorized"}   (no auth)
POST /api/create-portal-session   -> 401 {"error":"unauthorized"}   (no auth)
```
Auth is checked **before** input parsing, so a garbage bearer token, a missing
`priceId`, a SQL-ish `priceId`, and a non-string `priceId` all stop at `401` — the
`isValidPriceId` allowlist (`/^price_[A-Za-z0-9]{6,}$/`) is a second gate, not the
first. No stack traces, no env values; `billing_not_configured` returns variable
**names** only.

**Webhook signature verification — all three cases rejected:**
```
no stripe-signature       -> 400 {"error":"missing_signature"}
garbage signature         -> 400 {"error":"invalid_signature"}
well-formed but wrong sig -> 400 {"error":"invalid_signature"}
```
A forged `checkout.session.completed` naming an arbitrary `user_id` therefore cannot
reach the upsert. **Replay safety:** the handler upserts by `user_id` (primary key) and
each event type writes only the columns it owns, so replaying a captured *valid* event
is idempotent rather than corrupting `current_period_end`.

### Client bundle — no secrets · FACT
- **113 local `dist/` files (1.00 MB) — 0 hits.**
- **108 production chunks (993 kB), crawled transitively — 0 hits.**

Patterns searched: `sk_*`/`rk_*` Stripe keys, `whsec_*`, `SUPABASE_SERVICE_ROLE_KEY`,
`STRIPE_SECRET_KEY`, PEM private-key blocks, AWS `AKIA*`, GitHub `ghp_*`. Every JWT
found was decoded and its `role` claim checked — **no non-`anon` JWT anywhere**. The
`anon` key is present and is *supposed* to be (public, RLS-protected).

### The new landing · FACT
- **Zero database traffic.** The E2E test
  `landing: the three demo widgets are interactive and touch a database NEVER` records
  every request for the whole session and asserts no `/rest/v1/` call is made while
  driving all three widgets. It passes. The demos are pure in-memory state, and no
  analytics event fires from the landing.
- **No XSS sinks anywhere in `src/`.** A grep for
  `dangerouslySetInnerHTML|innerHTML|eval(|new Function(|document.write` returns
  **no matches** across the entire source tree. All demo content is static strings
  rendered as React children (auto-escaped); no visitor input is rendered at all.

### Auth flows — enumeration-safe · FACT
`authErrors.ts` collapses three separate account-existence oracles into one neutral
message: `otp_disabled` (magic link to an unknown address), `user_not_found` (reset),
and — the subtle one — `over_email_send_rate_limit`, which can *only* fire for an email
that **has** an account and would otherwise leak existence through a 429. Sign-in maps
`invalid login credentials` to a generic "that email and password don't match an
account". The E2E asserts the neutral reset copy. `resolve_login_email` — the
enumeration oracle from audit H1 — is confirmed **gone** live (`HTTP 404 PGRST202`).
`username_available` remains anon-callable and returns a bare boolean, no PII.

### PWA / service worker · FACT
`/sw.js` (7.1 kB, `application/javascript`): **117 precache entries, 0 containing
`/api/`**. `navigateFallbackDenylist` and `NetworkFirst` are both present in the
generated worker. Supabase is cross-origin and `/api/*` are POSTs, so no runtime-caching
rule matches either — neither is ever cached. Navigation is network-first with a 3s
timeout, so a stale shell can never be pinned "forever", and updates surface as a toast
with an explicit Reload rather than a silent mid-session swap.

---

## 4. The `vercel.json` headers block — APPLIED 2026-07-28

Presented in two parts because the risk profiles differ. **Both were approved and
are now live in `vercel.json`**, and the Vite dev/preview server reads that same
file so local development serves byte-identical headers.

**Part 1 — safe to ship as-is.** None of these can break the app; `frame-ancestors`
is expressed via `X-Frame-Options` so no CSP is involved.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
      ]
    }
  ]
}
```

> `payment=()` is safe: Stripe Checkout runs on **stripe.com**, redirected to — it is not
> embedded, so the Payment Request API is never used from this origin.

**Part 2 — CSP, Report-Only first.** Add this header to the same block. It observes
and reports without enforcing, so it **cannot** break the app. Watch the console for
violations for a few days, then rename the key to `Content-Security-Policy` to enforce.

```json
{
  "key": "Content-Security-Policy-Report-Only",
  "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://lplsbfduankkpglyusjp.supabase.co wss://lplsbfduankkpglyusjp.supabase.co; frame-src https://js.stripe.com https://checkout.stripe.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"
}
```

Derived from what the app actually does, not from a template:
`style-src 'unsafe-inline'` is required (Tailwind + the inline gradient styles on the
landing hero); `connect-src` includes the **`wss://`** Supabase origin because realtime
sync is on (`ENABLE_REALTIME = true`) and would break without it; `fonts.googleapis.com`
/`fonts.gstatic.com` cover the Google Fonts link in `index.html`; `frame-src` covers
Stripe.js if you later embed it. `script-src` is **not** given `'unsafe-inline'` — Vite
emits external module scripts, so it shouldn't need it, and Report-Only will tell you
for certain before you enforce.

---

## 5. Before you go public

1. ~~**Apply Part 1 of the headers block** (M1).~~ **DONE** — shipped along with
   the Report-Only CSP, dev/prod parity, and test coverage at both layers.
2. **Decide on M2** — unauthenticated writes to `events`/`upgrade_intents`/
   `feature_intents`. Not a breach risk, but the analytics that justify the whole wedge
   are forgeable by anyone, and you'd rather know that now than after reading the numbers.
3. **Run `npm audit fix`** and re-run the suite — clears M3 and the L3 toolchain set.
   The only browser-facing one is `react-router`.
4. ~~**Turn CSP Report-Only on**~~ **DONE** — now watch real production reports for
   a few days, then flip the header name to `Content-Security-Policy` to enforce.
   Ignore violations seen in `npm run dev`: Vite injects an inline HMR preamble
   and connects over `ws://localhost`, neither of which exists in a production
   build. `securityHeaders.test.ts` will fail the moment the header is switched to
   enforcing, which is the intended speed bump.
5. **Delete the 6 `source='audit'` rows** (SQL in §1).

Nothing on this list blocks a launch. The parts that would have been expensive to get
wrong — tenant isolation, the paid-plan gate, webhook authenticity, secret hygiene — are
all correct, and I verified each one against the live system rather than reading the code
and assuming.

---

*Scope note: no migrations were run and no auth/billing/RLS logic was modified during
this audit. Every probe was read-only except the 6 disclosed fake-door rows and the two
self-deleted throwaway accounts.*
