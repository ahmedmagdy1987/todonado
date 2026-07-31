# Todonado — final pre-launch security audit

**Date:** 2026-07-31 · **Commit at audit time:** `3806bb8` · **Target:** the LIVE cloud project
`lplsbfduankkpglyusjp`, probed with two throwaway accounts that self-delete.

Every claim below is tagged **FACT** (observed directly, with the response quoted or the file and
line cited) or **INFERENCE** (reasoned from code I read but did not execute). Severity is
Critical / High / Medium / Low.

The short version: **the data layer is sound.** Twenty-two tables, cross-user probes, storage path
policies, the mind-map link guard, the API endpoints and the client bundle all came back clean.
The two findings that matter are a response *header* that would have broken a shipped feature in
production, and a production dependency with an advisory that this app does not appear to be
exposed to. Neither is a data-exposure issue.

---

## 1. Findings

### F1 — HIGH · FACT · `Permissions-Policy` disabled the microphone for our own origin
**Fixed in this commit.**

`vercel.json` served `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`.
An empty allowlist `()` denies the feature to **every** origin, including `self`. The journal's
voice notes call `getUserMedia({ audio: true })`, so in production every recording attempt would
have failed — and the app would have reported it honestly as "the microphone is blocked for this
site", which is true and completely unactionable, because the block came from us.

This was invisible in every environment we test in: the Vite dev server sends no
`Permissions-Policy` header at all, so local dev and the whole E2E suite exercise the permissive
path. It would have appeared for the first time on `www.todonado.com`.

The header predates the journal by two sessions. It was correct when written.

- **Fix:** `microphone=(self)`. `payment=(self)` for the same reason ahead of Stripe going live —
  the Payment Request API is used by Stripe Checkout's embedded flows.
- **Regression guard:** `e2e/smoke.spec.ts` and `src/test/securityHeaders.test.ts` now both assert
  `microphone=(self)` specifically, not merely that the header exists. There is exactly one source
  of truth — `vite.config.ts` reads the header block out of `vercel.json` and serves it in dev and
  preview — so dev and production cannot drift.

**One thing I checked rather than assumed.** An earlier session recorded that this machine's
Chromium has no audio-capture backend, which is why `e2e/journal-audio.spec.ts` substitutes
`getUserMedia`. That diagnosis could plausibly have been THIS header all along. It was not: with
`microphone=(self)` now served and verified in the response, `getUserMedia` still answers
`NotSupportedError: Not supported` (permission state `granted`), which is a missing device, not a
policy denial. The two problems are independent — the header was a real production blocker, and
the local failure is real too. Worth stating because the header made `NotAllowedError` appear in
one of the earlier probe variants and could easily have been mistaken for the whole story.

### F2 — MEDIUM · FACT + INFERENCE · `react-router-dom` open-redirect advisories (production dep)
**Reported, not fixed — this is a decision, not a bug in our code.**

`npm audit` reports two moderate advisories against `react-router` / `react-router-dom`
(installed **6.30.4**):
- *Open redirect via backslash in `<Link>` and `useNavigate` (CVE-2025-68470 bypass)*
- *Arbitrary Constructor Injection via `deserializeErrors()` in SSR hydration*

**Exposure assessment (FACT):** the SSR advisory is not applicable — this is a client-only SPA
with no `deserializeErrors` path. For the open redirect, I grepped every `navigate()` and
`<Navigate>` in `src/`: the only redirect target derived from anything other than a literal is
`LoginPage.tsx:60`, which reads `location.state.from.pathname`. React Router holds `location.state`
in memory; a crafted URL cannot set it. **No redirect target in this app comes from a query
string, hash, or any other attacker-controllable input.**

**Hardening applied anyway (FACT):** `src/features/auth/safeRedirect.ts` validates the path
before use and refuses absolute URLs, `//host`, `/\host` (the exact CVE bypass shape, which
browsers normalise to `//`), `javascript:`, and control characters. This makes the class impossible
by construction if anyone later threads a parameter into a redirect. 4 unit tests.

**Decision for the owner:** the advisory fix is `react-router-dom@7`, a major version with
breaking changes. Given the exposure assessment above I do **not** recommend taking that upgrade
days before launch. Revisit post-launch.

### F3 — LOW · FACT · a storage key may contain a literal `..` segment
Uploading with a percent-encoded traversal — `<uid>%2F..%2F<other-uid>/evil.webm` — returns **200**.

**It is not an escape.** I verified where the object actually lands:

```
stored Key:            journal-audio/<B-uid>/../<A-uid>/evil.webm
A's folder listing:    (empty)
A GET, all 3 spellings: 400, 400, 400   (refused)
B GET its own key:     200              (B's own namespace)
```

`storage.foldername(name)[1]` resolves to **B's own uid**, so the policy did exactly its job: B
wrote into B's own folder under a cosmetically silly name. A cannot read, list or reach it.
Impact is hygiene (a `..` entry appears in B's own listing), not access.

- **Not fixed.** The client never constructs such a key (`audioKey()` builds
  `<uid>/<date>-<rand>.webm`), and the fix would be a bucket-level key validation Supabase does not
  expose. Recorded so a future reader does not re-discover it and assume the worst.

### F4 — LOW · FACT · CSP is `Content-Security-Policy-Report-Only`
`vercel.json` ships a well-formed policy (`default-src 'self'`, `object-src 'none'`,
`frame-ancestors 'none'`, Stripe frames allowed, Supabase in `connect-src`) but in **report-only**
mode, so it is documentation rather than enforcement.

- **Not changed.** Flipping to enforcing on launch day, untested, risks blanking the app on a
  policy the report-only mode has never been observed reporting against — nothing collects the
  reports today. **Decision for the owner:** enable reporting to a collector, watch it for a
  week of real traffic, then enforce.

---

## 2. RLS sweep — every table

**FACT.** Anonymous `GET` and `POST` against all 22 tables, with the public anon key.

| Result | Tables |
| --- | --- |
| anon `GET` → `200 []` (RLS filtering, **no rows leaked**) | all 22 |
| anon `POST` → `401 42501` (RLS refusal) | profiles, workspaces, workspace_members, projects, sections, tasks, subtasks, focus_sessions, calendar_sources, billing, user_templates, wellness_items, wellness_logs, quit_habits, quit_checkins, vision_cards, **mind_maps**, **user_challenges**, **journal_entries** |
| anon `POST` → `400 23502` (not-null fired before RLS) | events, upgrade_intents, feature_intents |

The last three are the **insert-only fake-door / analytics tables**, and anon insert is
deliberate. Verified their design holds:
- `events` policy is `with check (user_id is null or user_id = auth.uid())` — an anon caller can
  only file an unattributed event, and cannot attribute one to somebody else.
- `upgrade_intents` / `feature_intents`: anon insert `201` **by design**, and an authenticated
  read-back returns `[]` — there is no select policy, so nothing can be read back out. **FACT.**

### Cross-user probes (account B against account A's rows)

**FACT**, run against `projects`, `tasks`, `mind_maps`, `journal_entries`, `user_challenges`:

| Probe | Result |
| --- | --- |
| unfiltered `select *` as B | **clean** — A's rows absent from every table |
| `select` by A's row id | **clean** — empty |
| `UPDATE` A's row | refused |
| `DELETE` A's row | refused |
| `INSERT` a row with `user_id = A` | **403** on mind_maps, journal_entries, user_challenges, vision_cards |
| `rpc/complete_task` on A's task as B | `P0002 Task not found` — RLS-scoped, B cannot see it to complete it |
| `rpc/delete_own_account`, `rpc/complete_task` as anon | `401 42501` |
| `rpc/resolve_login_email` | `404 PGRST202` — still dropped (audit H1 stays closed) |

### The mind-map node→project/task link guard

**FACT.** `mind_map_links_ok` is the one bespoke guard in the schema, so it got its own matrix:

| Forgery attempt by B | Result |
| --- | --- |
| node links **A's project id** | `403 42501` refused |
| node links **A's task id** | `403 42501` refused |
| malformed uuid (`not-a-uuid`) | `403` refused — the regex guard, not a 22P02 |
| SQL-ish string (`' or '1'='1`) | `403` refused |
| no link at all (control) | `201` accepted — the guard is not simply denying everything |
| **via UPDATE** on B's own map | `403` refused — both write paths are covered |

The control case matters: a guard that refuses everything would pass the first four checks while
being broken.

---

## 3. Storage — `journal-audio`

**FACT**, live probes:

| Probe | Result |
| --- | --- |
| A uploads into its own folder | `200` |
| B uploads into **A's** folder | `400` refused |
| B uploads with `../` traversal | `400` refused |
| B uploads with `%2F..%2F` traversal | `200` — **lands in B's own namespace**, see F3 |
| B uploads a root-level key (no folder) | `400` refused |
| B uploads `text/html` | `400` refused — **MIME allow-list is SERVER-side** |
| B uploads 12 MB | `400` refused — **size cap is SERVER-side** |
| public URL for A's object | `400` — bucket is private |
| anonymous fetch of A's object | `400` refused |
| signed URL, immediately | `200` |
| signed URL, after expiry (1 s, waited 3 s) | `400` — **expiry is enforced** |
| signed URL with a tampered token | `400` refused |
| **B asks to sign A's object** | `400` refused |

**Explicit answer to the question asked:** the size and MIME caps are enforced **server-side**, on
the bucket (`file_size_limit`, `allowed_mime_types` in
`20260731140000_journal_entries.sql`), not merely in the client. The client's 5-minute / 10 MB
guards are a courtesy that produces a better error; removing them would not open a hole.

---

## 4. `/api` endpoints — nothing regressed

**FACT** (source review) + the existing 181 passing api/_lib tests, including 61 SSRF cases.

| Endpoint | Method gate | Auth | Plan gate | Notes |
| --- | --- | --- | --- | --- |
| `create-checkout-session` | `405` non-POST | `401` without a valid JWT | — | see F5 below |
| `create-portal-session` | `405` | `401` | — | admin client used only after JWT verification |
| `stripe-webhook` | `405` | **signature required** (`400 missing_signature`), raw body via `req.text()` | — | service-role write is webhook-only |
| `calendar-fetch` | `405` | `401` | **server-side** `resolveServerPlan` → `403` | ignores the request body entirely; URLs come only from the caller's own rows, so it can never be an open proxy |

SSRF guard (`api/_lib/ssrf.ts`, 61 tests): scheme/port allow-lists, no embedded credentials, DNS
resolved and every address checked against private ranges before a socket opens, redirects
followed manually and re-validated per hop, 10 s timeout, streaming byte cap, and every rejection
reason collapsed to `invalid_source` so it cannot be used as a network oracle.

### F5 — LOW · INFERENCE · `create-checkout-session` does not refuse an existing subscriber
The endpoint validates the JWT and calls `stripe.checkout.sessions.create` unconditionally; it
does not check whether the caller already resolves to Pro with a live subscription. A subscriber
who reached the button (see the PlanPage loading window, fixed in `3806bb8`) could start a second
checkout.

Dormant today — Stripe keys are unset — and Stripe itself would create a second subscription
rather than double-charge silently. **Decision for the owner:** return `409` when the server
already resolves the caller to Pro. I have not made this change because it touches billing.

---

## 5. Client bundle, XSS, PWA

- **Secrets — FACT.** Crawled **all 172 built files** in `dist/` for `service_role`, `sk_live_`,
  `sk_test_`, `whsec_`, `STRIPE_SECRET`, `-----BEGIN`, and every JWT-shaped string, decoding each
  JWT's payload to read its `role`. **Exactly one JWT is present and its role is `anon`.** No
  service-role key, no Stripe secret, no private key.
- **XSS — FACT.** Zero occurrences of `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`,
  `document.write`, `eval(` or `new Function(` anywhere in `src/` or `api/`. All new user content
  (journal text, mind-map node titles and notes, vision cards, challenge names, task titles)
  renders as React text children, which escapes by construction. No user value reaches an `href`
  or `src`.
- **Enumeration — FACT.** `resolve_login_email` remains dropped (`404`). Forgot-password returns
  the neutral confirmation; covered by `e2e/smoke.spec.ts:140`.
- **Service worker — FACT.** `navigateFallbackDenylist: [/^\/api\//]`, and the single
  `runtimeCaching` entry matches only `request.mode === 'navigate'` with a non-`/api/` path. Both
  `/api/*` (POSTs) and Supabase (cross-origin) therefore match no runtime route and are never
  cached. Auth tokens live in `localStorage`, never in a cached response.
- **Headers — FACT.** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, HSTS with `includeSubDomains; preload`, CSP
  report-only (F4), Permissions-Policy (F1, fixed).

---

## 6. `npm audit` — reported, not blind-fixed

11 advisories: 1 critical, 5 high, 5 moderate.

**Ten of the eleven are dev-only** and cannot reach a user: `vitest` (the critical — arbitrary file
read *when the Vitest UI server is listening*, which this project never starts), `vite`, `esbuild`
(dev-server request forgery), `vite-node`, `@vitest/mocker`, `postcss`, `js-yaml`,
`brace-expansion`, `fast-uri`. None is in `dependencies`.

**One is a production dependency:** `react-router-dom` — see F2 for the exposure assessment and
the recommendation.

`fixAvailable: true` on all of them, but the react-router fix is a major-version bump. My advice:
take the dev-only fixes at any time; leave react-router until after launch.

---

## 7. What was checked and found clean

Recorded so the next audit knows what has already been covered, and so "no findings" is not
mistaken for "not looked at":

- All 22 tables: anon read, anon write, cross-user read/update/delete/insert-as, and unfiltered
  `select *`.
- The three tables added this week (`mind_maps`, `user_challenges`, `journal_entries`) behave
  identically to the established owner-only tables.
- The `journal-audio` bucket: privacy, path policy, traversal, MIME, size, signing, expiry,
  tamper, cross-user signing.
- All four `/api` endpoints, the SSRF guard, and the webhook signature path.
- The entire built bundle.
- Every XSS sink in the codebase.

**Coverage caveat, stated plainly:** this is live black-box probing plus source review. It does
not include a dependency-supply-chain review beyond `npm audit`, load or DoS testing, or a review
of Supabase's own platform configuration (project-level API settings, JWT expiry, email rate
limits) — that last one is a dashboard concern I cannot reach from here and should be checked
before launch.
