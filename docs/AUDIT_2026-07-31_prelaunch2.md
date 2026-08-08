# Todonado — Security audit, second pre-launch pass

> **Date:** 2026-07-31 · **Base commit:** `7e32efc` (`main`) · **Method:** adversarial black-box
> probing against the LIVE cloud project (`lplsbfduankkpglyusjp`) with self-cleaning throwaway
> accounts, plus full source review of every write path, endpoint and user-authored surface.
>
> **Honesty legend:** **FACT** = demonstrated, with the request/response or the line of code that
> does it. **INFERENCE** = reasoned from code, not executed. Every finding says which, because a
> report that blurs the two cannot be acted on.
>
> **Updated 2026-07-31, later the same day.** Six of the sixteen flagged items were taken in a
> follow-up pass and are marked **CLOSED** below with the commit that did it. Everything still
> flagged is either billing-dependent (and cannot be verified until Stripe is live) or needs
> infrastructure. Nothing was silently dropped.
>
> This supersedes nothing. `docs/AUDIT_2026-07-31_final.md` covered the same ground earlier the
> same day; this pass re-ran all of it and went further into the four `/api` endpoints, the two
> recurring bug classes, and the surfaces added since.
>
> ---
>
> ### ADDENDUM 2026-08-01 — the billing-dependent flags were closed
>
> This document is a dated record and its FINDINGS are left exactly as written. Two factual
> claims about migration state went stale and are corrected in place, each with a note saying so
> (FLAG-7, FLAG-9): both files had been applied by the owner.
>
> Work done since, on branch `billing-golive-audit-flags`, ahead of switching Stripe to live keys:
>
> | Flag | Outcome |
> | --- | --- |
> | FLAG-2 | **CLOSED** — server-side price allow-list at checkout AND price verification before the webhook grants Pro |
> | FLAG-3 | **CLOSED** — event de-duplication + ordering by Stripe's `event.created`, via a high-water mark on `billing`. Needs `20260801140000_billing_event_ordering.sql`, which must be applied before live keys |
> | FLAG-4 | **CLOSED** — return URLs built from a validated `APP_BASE_URL`; the Origin header is never read |
> | FLAG-8 | **HARDENED** — founding access requires a verified address and refuses aliases; the billing-row replacement is documented with its SQL |
> | FLAG-10 | **PARTIAL** — a per-user in-process limiter on billing + calendar. Stops loops and self-inflicted Stripe throttling; does NOT stop a distributed attacker. Stated in full in `api/_lib/rateLimit.ts` |
> | FLAG-11 | **CLOSED** — CSP now enforces in production (report-only in dev, where Vite's inline HMR preamble would otherwise break) |
> | FLAG-14 | **CLOSED** — active-subscription refusal, Stripe customer reuse, and a checkout idempotency key |
> | FLAG-15 | **CLOSED** — one timeout and one byte budget per REQUEST rather than per hop; redirect bodies drained |
> | FLAG-6 | **CLOSED** (2026-08-07, issue #10) — the connection is PINNED to the address that was validated, via a custom `lookup` hook on a hop-scoped `node:https` Agent. No second resolution happens, so there is no TOCTOU window left to race. The undici problem below was real and was routed around rather than solved: `node:http`/`node:https` expose the same hook with no production dependency |
> | FLAG-5 | **STILL OPEN.** Residual risk stated in full in the `api/_lib/ssrf.ts` header. The durable fix is a per-user cap on `calendar_sources` rows plus write-time URL validation — a migration the owner should schedule deliberately |

---

## 0. VERDICT

**Nothing found here would embarrass a FREE launch.** No data of one user is reachable by another,
by anonymous callers, or through storage. The database is doing the work, not the client.

**FLAG-1 is now closed** (the dev Pro preview switch no longer exists in a production bundle).
What remains for a PAID launch is billing-shaped and unverifiable until Stripe is live: checkout
accepts any price id while the webhook grants Pro without checking what was bought (**FLAG-2**),
and the webhook has no event de-duplication, so a retried out-of-order `subscription.deleted`
downgrades a paying customer (**FLAG-3**). Neither is exploitable today, because nothing can be
bought at all.

Thirteen issues were fixed in the first pass. The follow-up closed four outright (FLAG-1, 12, 13,
16) and closed the client half of two more (FLAG-7's quota, FLAG-9's input caps) whose server
halves need a storage policy and a migration respectively. **Ten remain fully open**, plus those
two server halves: every one of them is billing-dependent or needs infrastructure.

---

## 1. WHAT WAS PROVEN SOUND — with evidence

Everything in this section was **executed today** against the live project, not read.

### 1.1 RLS on all 22 tables — FACT

Probe: two throwaway accounts (A and B), one seeded row per user-scoped table, then anonymous and
cross-user requests against every table. Both accounts self-deleted afterwards.

| Check | Tables | Result |
| --- | --- | --- |
| Anonymous `select *` | all 22 | `200 []` on every one — the table exists, RLS returns nothing |
| Anonymous insert | all 22 | `401 / 42501` on every owner-scoped table |
| B runs unfiltered `select *` | 14 seeded | A's row appears in **none** of them |
| B `PATCH` A's row by id | 14 | 0 rows changed on every one |
| B `DELETE` A's row by id | 14 | 0 rows removed on every one |
| B inserts a row with `user_id = A` | 7 | `403` on every one |

The unfiltered `select *` is the one that matters: it proves isolation lives in the database, not
in a client-side `.eq('user_id', …)`.

Tables covered: `profiles`, `workspaces`, `workspace_members`, `projects`, `sections`, `tasks`,
`subtasks`, `focus_sessions`, `events`, `calendar_sources`, `upgrade_intents`, `feature_intents`,
`wellness_items`, `wellness_logs`, `billing`, `user_templates`, `quit_habits`, `quit_checkins`,
`vision_cards`, `mind_maps`, `user_challenges`, `journal_entries`.

### 1.2 Storage: the `journal-audio` bucket — FACT

| Probe | Result |
| --- | --- |
| A uploads to its own folder | `200` |
| B uploads INTO A's folder | refused |
| B reads A's object | refused |
| B lists A's folder | empty |
| Anonymous read of the object | refused |
| Public URL for the object | refused |
| B deletes A's object | refused |
| B signs A's object | refused |
| A uploads `../<B-id>/escape.webm` | refused — `new row violates row-level security policy` |
| A uploads 12 MB | `413 Payload too large` |
| A uploads `text/html` | `415 invalid_mime_type` |

**The size and MIME caps are enforced SERVER-side, on the bucket**, not only in the client. Stated
explicitly because a client-only cap would be worth flagging and this is not one.

Path traversal is worth its own sentence: `..` in a key does not escape — the policy checks the
FIRST path segment against `auth.uid()`, so a traversal attempt is simply a key that fails the
policy. The key shape *is* the authorisation.

### 1.3 Account deletion leaves no orphaned objects — FACT

Shipped in `20e9b2d` and re-verified here by code path: `removeAllJournalAudio` runs from the
client, before the RPC, while the user still holds the session the bucket policy grants; a failure
aborts the deletion rather than leaving recordings behind. `storage.objects` has no cascading FK to
`auth.users`, so without this step the row naming a recording vanished while the recording stayed.
Six unit tests pin the paging, including the case that leaves the OLDEST recordings behind.

### 1.4 The four `/api` endpoints reject unauthenticated callers — FACT

Probed against production (`https://www.todonado.com`):

```
/api/create-checkout-session   401  {"error":"unauthorized"}
/api/create-portal-session     401  {"error":"unauthorized"}
/api/calendar-fetch            401  {"error":"unauthorized"}
/api/stripe-webhook            400  {"error":"missing_signature"}
```

### 1.5 The client bundle carries the public anon key and nothing else — FACT

All **188** files in `dist/` were crawled for: `service_role`, `sk_live_`/`sk_test_`, `whsec_`,
`AKIA…`, PEM private keys, `SUPABASE_SERVICE_ROLE`, literal Bearer tokens, and **any JWT that is
not the known anon key**. One hit: the anon key, in one file, which is by design (public,
RLS-protected, documented in `src/lib/env.ts`).

### 1.6 Auth is enumeration-safe — FACT

```
unknown email      -> 400 {"error_code":"invalid_credentials","msg":"Invalid login credentials"}
known email, wrong -> 400 {"error_code":"invalid_credentials","msg":"Invalid login credentials"}
```

Byte-identical. `POST /auth/v1/recover` for an unknown address returns `200`, so the reset flow does
not confirm existence either. `resolve_login_email` — the enumeration oracle dropped in June — is
still gone (`404 PGRST202`). `complete_task` is `42501 permission denied` for anonymous callers.

> **Probe artifact, recorded so nobody re-finds it:** an early run reported `username_available` as
> `404`. That was the probe calling it with the wrong parameter name. With the real signature
> (`{ uname }`, which is what the client sends) it answers `200 true` / `200 false` correctly.
> `username_available` IS an anon-callable username-existence oracle by design: boolean only, no
> PII, and usernames are never displayed publicly. Unchanged from the June assessment.

### 1.7 Security headers on production — FACT

`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` ·
`X-Frame-Options: DENY` · `X-Content-Type-Options: nosniff` ·
`Referrer-Policy: strict-origin-when-cross-origin` ·
`Permissions-Policy: camera=(), microphone=(self), geolocation=(), payment=(self)`.

CSP is present but **Report-Only** — see FLAG-11.

### 1.8 No XSS sink anywhere — FACT

`dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`,
`eval`, `new Function` and `srcdoc`: **zero occurrences** in `src/` and `api/`. Every user-authored
string reaches the screen as a React text child. The share card draws to canvas and is passed a
number and a caption; the habit name is not a parameter of that module at all, which is the
strongest form of "it cannot leak".

### 1.9 The service worker never caches `/api` or auth — FACT

`vite.config.ts:115` sets `navigateFallbackDenylist: [/^\/api\//]`, and the single runtimeCaching
entry matches only navigations that are not `/api/`. Supabase is cross-origin and unmatched.

---

## 2. FIXED IN THIS PASS

Each fix ships with a test, and each test was **proven to fail against the old code** before the
fix landed. That negative control is stated per item, because a test that has never failed is a
test that proves nothing.

### F-1 · Medium · FACT — Reset-password page rendered attacker-supplied text

`src/features/auth/ResetPasswordPage.tsx:39`

`error_description` from the URL was rendered verbatim in the page's red alert banner. Anyone could
send `…/reset-password#error=x&error_description=<any prose>` and have their own words appear on
the real domain, over TLS, in the app's own styling, on the one screen someone opens *because they
are worried about their account*. React escapes it, so this was never script injection — it is
worse in the way that matters, because it looks exactly like us.

The fragment form never reaches a server log, so it could not be caught downstream either.

**Fixed:** the parameter now chooses between our strings and nothing else.
**Test:** `e2e/smoke.spec.ts` "reset-password never renders text supplied in the URL", covering both
the query and the fragment carrier.
**Negative control:** with the reflection restored, the test fails and prints the injected phone
number rendered on the page.

### F-2 · Medium · FACT — The optimistic-id sweep modelled only a subset of the write API

`src/lib/optimistic.test.ts`

The sweep matched `.insert(` and `.upsert(` only. Three shapes were invisible to it:

- `.update(patch)` — a PATCH carries foreign keys too
- `.rpc('name', payload)` — the recurrence spawn goes through this
- `.insert({ ...input })` and `.insert(buildRow(x))` — spread and call expressions hid the keys

and its scope heuristic let a **sibling** arrow function's guard satisfy its neighbour, which
matters because `useApplyTemplate` holds three sibling inserts (projects, sections, tasks).

**Fixed:** the sweep now covers `insert|upsert|update|rpc`, treats any non-literal payload as
opaque, and anchors scope on `=>` as well as `function`/`mutationFn`.
**Negative control:** widening it immediately failed with **11 real unguarded writes** on the
then-current tree. All 11 are fixed below.

### F-3 to F-11 · Medium/Low · FACT — the eleven writes the widened sweep found

| # | Site | What could reach a uuid column |
| --- | --- | --- |
| F-3 | `useVision.ts` `updateCard` | `vision_cards.project_id` from an in-flight project |
| F-4 | `completeTask.ts` the RPC branch | the whole spawned occurrence, inheriting `project_id`/`section_id`. The guard sat on the legacy fallback that almost never runs |
| F-5 | `useFocusSessions.ts` `updateSession` | patch |
| F-6 | `useJournal.ts` `updateEntry` | patch |
| F-7 | `useMindMaps.ts` `persistMindMap` | patch (the detached save that runs on unload) |
| F-8 | `useMindMaps.ts` `saveMap` | patch |
| F-9 | `useUpdateProfile.ts` | row |
| F-10 | `useUserTemplates.ts` `updateTemplate` | patch |
| F-11 | `upgradeIntents.ts` / `featureIntents.ts` | opaque built rows — and these two tables have **no DELETE policy**, so a bad row is permanent |

F-4 is the sharpest: the RPC's compare-and-swap update and its spawn insert are one transaction, so
a `22P02` on a copied placeholder aborts **both** — the task is not even marked done, and the user
sees a generic error on a checkbox that visibly did nothing.

### F-12 · Low · FACT — The calendar proxy was an internal-hostname oracle

`api/calendar-fetch.ts:49`

`dns_failed` mapped to a different client-facing code than `private_host`, so the response
distinguished "that name does not resolve" from "that name resolves to something private" — exactly
the oracle the surrounding comment claimed the collapse prevented. One line: `dns_failed` joins the
`invalid_source` group.

### F-13 · Low · FACT — Route parameter concatenated into a PostgREST query string

`src/features/mindmaps/api/useMindMaps.ts:117`

The keepalive save is the one write in the app that builds its query string by concatenation rather
than through the client. `id` comes from a route parameter. Now `encodeURIComponent`'d. No
demonstrated exploit; fixed because it is the single place where the pattern exists.

---

## 3. FLAGGED FOR YOUR DECISION — highest severity first

Each of these touches RLS, auth, billing, a storage policy, infrastructure, or needs a migration.
None was changed.

### FLAG-1 · **High** · FACT — ~~The dev Pro preview switch works in production~~ **CLOSED**

`src/features/billing/plan.ts:46`

`readPlanOverride()` reads `localStorage.getItem('todonado.plan')` in **any** build. A signed-in
user opens devtools, sets `todonado.plan = 'pro'`, reloads, and has the entire paid tier:
week planning, Insights, unlimited history, voice notes, and every unlimited cap.

Scope, stated precisely: this is **client-side only**. `resolveServerPlan` in
`api/_lib/entitlement.ts` reads the `billing` table and ignores the override, so the calendar proxy
— the one server-gated Pro feature — is unaffected. No RLS is violated and no other user's data is
reachable. It is revenue leakage, not a breach.

**Recommended fix (one condition):** gate the localStorage branch on `import.meta.env.DEV`, the way
the `VITE_PRO_PREVIEW` branch immediately below it already does, so a production bundle cannot read
it at all.

**CLOSED.** `readPlanOverride` now returns `null` unless `import.meta.env.DEV`. Vite replaces
that with a literal at build time, so the branch is dropped from the production bundle entirely —
verified by grepping the built assets: the key `todonado.plan` no longer appears in `dist/` (the
only remaining hit is the unrelated `todonado.planScope` prefix). The E2E suite drives the dev
server, so its Pro preview still works. `planOverride.test.ts` pins both directions, and with the
condition removed it fails on the production case.

### FLAG-2 · Medium · FACT — Checkout accepts any price id; the webhook grants Pro regardless

`api/create-checkout-session.ts:43`, `api/stripe-webhook.ts`

The `priceId` comes from the request body and is not checked against an allow-list. The webhook
then grants `plan: 'pro'` for **any** completed checkout without inspecting what was bought. Any
authenticated user could subscribe at any recurring price that exists in the Stripe account: a
grandfathered price, an internal discount price, a partner price.

**Fix:** put the price ids in server env (`STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY`) and reject
anything else; separately, have the webhook verify the price on the subscription before granting.

### FLAG-3 · Medium · FACT — Webhook has no event de-duplication and no ordering guard

`api/stripe-webhook.ts:55`

The signature and its 300s tolerance are verified correctly, but there is no `event.id` de-dup and
no comparison of `event.created` against what is already stored. A retried, out-of-order
`customer.subscription.deleted` written after a later `checkout.session.completed` **silently
downgrades a paying customer**. This needs no attacker: Stripe retries, and retries arrive out of
order.

**Fix:** a processed-events table keyed on `event.id` (insert-then-check, so a duplicate is a
`23505` no-op) plus storing `event.created` on the billing row and applying only newer events.
This is a migration, so it is yours to schedule.

### FLAG-4 · Medium · FACT — Stripe return URLs are built from the `Origin` header

`api/create-checkout-session.ts:46`, `api/create-portal-session.ts:43`

`req.headers.get('origin')` is interpolated unvalidated into `success_url`, `cancel_url` and
`return_url`. An attacker with their own free account can request a real `checkout.stripe.com` URL,
bound to your genuine merchant account with your branding, that redirects to **their** domain on
completion.

Scope: not reachable against a victim's browser — these endpoints are Bearer-authenticated with no
cookies, so a third-party page cannot obtain the victim's token. The attacker uses their own.
**Fix:** allow-list the origin, falling back to the constant already on that line.

### FLAG-5 · Medium · FACT — The calendar proxy is an authenticated open proxy

`api/calendar-fetch.ts:87`

The design note says it "can never be an open proxy" because URLs come only from the caller's own
`calendar_sources` rows. That is true of the request body and false of the outcome: the user
controls those rows, so the URL is still fully user-chosen — just via an INSERT instead. Any Pro or
founding user can issue arbitrary GETs to any public host on 80/443 from Vercel's egress IPs and
read up to 2 MB of the response back.

**Fix:** validate the URL at WRITE time as well as fetch time, and cap `calendar_sources` rows per
user. The write-time validation is the one that changes the shape of the problem.

> #### 🟡 FIX WRITTEN, MIGRATION NOT YET APPLIED (2026-08-08)
>
> `supabase/migrations/20260808120000_calendar_sources_write_guard.sql` is committed and
> **deliberately unapplied**. Until the owner runs it, production is unchanged and this flag stays
> **OPEN**. Production `calendar_sources` currently holds **0 rows**, so applying it can reject
> nothing that exists.
>
> **Why it had to be a migration.** The only writer is the browser, through PostgREST, as
> `authenticated`; `service_role` holds `SELECT` and nothing else on this table. There is no
> server-side write path to put a check in, so a guard anywhere but the database would be advice.
>
> | | |
> |---|---|
> | **Per-user cap** | **10 rows, every plan.** Not a plan limit — an abuse ceiling, so Pro and Founding are subject to it too. Ten is `MAX_SOURCES_PER_REQUEST` from issue #9, so nobody can own a calendar that silently never refreshes. `calendarCaps.test.ts` pins the client constant, the migration and the request limit to one number. |
> | **Race safety** | A `before insert or update of user_id` trigger holding `pg_advisory_xact_lock` keyed on the user. `count(*)` then `insert` is not safe under READ COMMITTED, and locking the user's existing rows `for update` is the tempting fix that fails at zero rows — there is nothing to lock. **Both failure modes were reproduced** by removing the lock and watching the two race tests go red. |
> | **URL policy** | Structural only, in an `IMMUTABLE` function behind a CHECK: scheme in http/https/webcal, no embedded credentials, no IP literal (v4 or v6), port in 80/443, a dotted DNS name, no whitespace or control characters. |
> | **Duplicates** | A partial unique index on `(user_id, url) where kind = 'url'`. Near-duplicates stay a fetch-time concern for `calendarUrlKey`. |
> | **Shape** | `kind='url'` now actually requires a url, and `kind='file'` requires `ics_text` — previously neither was true. |
>
> **The write-time check never resolves DNS, and must never learn how.** A lookup inside a CHECK
> would put a network round trip on the write path, make the constraint non-deterministic, and hand
> every authenticated user a way to make the *database* emit outbound requests — a fresh SSRF
> primitive introduced by the anti-SSRF fix. So `metadata.google.internal` is structurally ordinary
> and IS accepted at write time; it is refused at fetch time by `resolveAllPublic` + `isPrivateIp`,
> which see the address rather than the name.
>
> **Fetch-time remains authoritative.** Nothing here replaces FLAG-6's pinning or issue #9's
> budgets. What changes is that the table can no longer be used as unbounded storage for
> attacker-chosen targets: the fan-out per request was already 10, and the fan-out per *account* is
> now 10 as well.
>
> Closing criteria: the migration applied to production and verified. Not the merge of the PR.

### FLAG-6 · Medium · FACT — ~~SSRF guard re-resolves the hostname at connect time~~ **CLOSED**

`api/_lib/ssrf.ts:216`

The guard resolves the hostname, checks every address against private ranges, and then hands the
**hostname** to `fetch`, which resolves it again independently. That is a textbook DNS-rebinding
TOCTOU: a caller controlling their own DNS can win the race and have the function fetch an internal
address, with the body returned to them.

Real-world exploitability on Vercel's managed runtime is limited (there is no corporate internal
network to reach), which is why this is Medium and not High.
**Fix:** pin the connection to the address that was validated — an undici `Agent` with a custom
`lookup` returning the checked IP, keeping the original `Host` header and SNI.

**CLOSED 2026-08-07 (issue #10).** The connection is pinned to a validated address. The suggested
fix is right in shape and wrong in one detail: an undici `Agent` cannot be used, because Node's
built-in `fetch` runs on Node's INTERNAL undici and rejects a dispatcher from the npm package
(`UND_ERR_INVALID_ARG`, custom lookup invoked 0 times — measured 2026-08-01). `node:http` /
`node:https` expose the same `lookup` hook, are already in the runtime, and cost no production
dependency, so the module now builds on those instead of `fetch`.

The hook returns the pre-validated literal address and never consults DNS, so the resolution the
socket performs IS the one that was checked. The ORIGINAL hostname is kept for the `Host` header,
SNI and certificate validation (`rejectUnauthorized: true`) — only the dialled address is
substituted. Each redirect hop is re-resolved, re-validated and re-pinned, an https→http downgrade
is refused, and the Agent is hop-scoped with `keepAlive: false` so no pooled socket can carry one
hop's pin into another. `dns.lookup` is NOT monkey-patched: that is process-global and would alter
resolution for Supabase and Stripe in the same lambda.

**The test seam moved with it**, and that mattered more than it looks. The old tests injected
`fetchImpl?: typeof fetch`, which cannot observe a connection address at all — every one of those
66 tests passed against the vulnerable code. The seam is now `http.request`-shaped, so a test
receives the real options object and CALLS the `lookup` hook to record which address would have
been dialled. Verified by negative control: reintroducing the second resolution fails exactly one
test, with `expected ['127.0.0.1'] to deeply equal ['93.184.216.34']`.

### FLAG-7 · Medium · FACT — ~~Journal audio has no per-user quota~~ **PARTLY CLOSED**

`src/features/journal/api/useJournal.ts:178`

Per-object caps are enforced (10 MB, audio MIME). There is no per-USER quota, and signup is free
and autoconfirmed. Any account can loop uploads into its own folder and consume unbounded paid
storage; every request is RLS-legal, so nothing refuses it. The recorder's entitlement check also
fails open during billing load (`isPro || billingLoading`), which is correct for a button and wrong
for a write.

**PARTLY CLOSED.** `uploadJournalAudio` now measures the user's folder and refuses a recording
that would take the account past **200 MB** (about 400 notes, or a year of recording daily), with a
message that names the numbers and offers two ways out. Enforced at the upload rather than at the
button, so it covers every path to a write.

**The server half is WRITTEN and — as of 2026-08-01 — APPLIED**:
`supabase/migrations/20260801130000_journal_audio_quota.sql`. *(This paragraph said "committed and
NOT applied" until the owner confirmed on 2026-08-01 that he had run `supabase db push` himself
and it succeeded. Corrected in place; the finding itself is unchanged.)* It is a
`before insert` **and** `before update of metadata` trigger on `storage.objects`, scoped to the
`journal-audio` bucket, summing the caller's own folder and refusing anything past 200 MB. A
trigger rather than a policy because a `with check` cannot see the incoming size on the resumable
(TUS) path, where the row is created before `metadata->>'size'` is known — a policy would read NULL,
treat it as zero, and wave through exactly the upload path an abuser would reach for.
`journalAudioQuotaMigration.test.ts` pins its number to the client constant.

**Known risk before applying:** creating a trigger on `storage.objects` requires ownership of a
table Supabase owns, and may fail with `must be owner of table objects`. That failure changes
nothing (each migration is its own transaction); the fallbacks are an Edge Function in front of
uploads or a scheduled sweep, both worse, which is why the trigger is tried first.

**Still open regardless:** the plan re-check at upload (`isPro || billingLoading` fails open, which
is right for a button and wrong for a write).

### FLAG-8 · Medium · INFERENCE — Founding access is granted by email string

`src/features/billing/planCore.ts:53`

Server-side Pro can be granted by email alone, and email is a self-service, autoconfirmed
attribute. If a founding address were ever unregistered — or a new one added to the list before its
owner registers it, which is the documented workflow — a stranger could claim it and receive
server-side Pro.

**Fix:** move founding access into data the user cannot set: seed a `billing` row with
`plan='pro'` for those user ids (the table has no client write path) and delete the email list.

### FLAG-9 · Medium · FACT — ~~Core tables have no length constraints~~ **CLIENT HALF CLOSED**

`supabase/migrations/20260602120000_initial_schema.sql` and others

Size CHECKs exist only on tables added from 2026-07-28 onward. These have none:
`tasks.title`/`notes`, `projects.name`, `sections.name`, `subtasks.title`,
`profiles.display_name`/`full_name`, `wellness_items.*`, `calendar_sources.label`/`url`/`ics_text`.
`QuickAdd` has no `maxLength` either.

Sharpest edge: `calendar_sources.ics_text` is capped at 1 MB **in the browser only**, and that
column is re-parsed on every Today and Week render — so an oversized row wedges the user's own
client in a way the UI cannot repair.

Today this is self-inflicted only. It stops being self-inflicted the day shared workspaces ship,
because `tasks`, `projects` and `sections` are workspace-scoped: a 10 MB task title written by one
member becomes a denial of service against every other member.

**CLIENT HALF CLOSED.** `src/lib/limits.ts` holds the caps and every affected input now carries a
`maxLength`: task title (which had none at all), task notes, project name, section name, subtask
title.

**The database half is WRITTEN and — as of 2026-08-01 — APPLIED**:
`supabase/migrations/20260801120000_length_caps.sql`. *(This paragraph said "committed and NOT
applied … `supabase db push` must not run until you decide" until the owner confirmed on
2026-08-01 that he had already run it successfully. Corrected in place; the finding is unchanged.)*
With the CHECKs live, the caps are no longer client-side-only filtering — the database enforces
them, which is what this flag asked for.

`limits.test.ts` reads that migration **constraint by constraint** and asserts every constant
matches, so the two halves cannot drift apart between now and the day it runs. Its first version
searched the whole file for a clause like `char_length(name) between 1 and`; that clause occurs
three times, all three happen to be 200, and three of the ten constants had no assertion of their
own at all — so raising `sectionName` to 300 would have left the suite green. Same class of bug as
F-2 in section 2: **a guard test that checks a subset reports on the subset.**

Two defects in the handoff SQL surfaced while moving it, both of which would have failed the push:
its dry run checked only the UPPER bound while the constraints are `between 1 and N`, so a
pre-existing EMPTY title would have passed the dry run and then aborted the migration; and its
idempotency guards matched on `conname` alone, which is unique per table rather than per database.

### FLAG-10 · Medium · FACT — No rate limit on any endpoint

None of the four `/api` handlers has one. Cost and availability rather than confidentiality:
burnable Vercel spend, Stripe API throttling that would break checkout for real customers, and —
combined with FLAG-5 — an outbound request generator.

### FLAG-11 · Low · FACT — CSP is Report-Only and reports nowhere

`vercel.json:14`

The policy is well-formed (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`) but
ships as `Content-Security-Policy-Report-Only` with no `report-uri`/`report-to`. It therefore
neither blocks anything nor collects anything: it is documentation. Given a Vite build with no
inline scripts, promoting it to enforcing is the easy case.

### FLAG-12 to FLAG-16 · Low

| # | Finding | Where |
| --- | --- | --- |
| ~~FLAG-12~~ **CLOSED** | Unauthenticated callers learned which server env vars were unset. The check now splits: what authentication itself needs is verified first and answers **without names**, and the useful list is returned only after the caller is known. The webhook, whose caller can never be identified before the secret exists, logs the names and returns a bare 503. | `api/create-checkout-session.ts`, `create-portal-session.ts`, `calendar-fetch.ts`, `stripe-webhook.ts` |
| ~~FLAG-13~~ **CLOSED** | Upstream Stripe messages are no longer returned. They are logged and the caller gets the bare `stripe_error` code, which is all the client ever used. The `sb_secret_` gap in the redactor stops mattering for the response path. | `api/create-checkout-session.ts` |
| FLAG-14 | Checkout never reuses the stored Stripe customer or refuses an existing subscription, so one user can hold several paid subscriptions while `billing` remembers only the last | `api/create-checkout-session.ts:50` |
| FLAG-15 | SSRF fetch timeout and byte cap are per hop, not per request; redirect bodies are never drained | `api/_lib/ssrf.ts:218` |
| ~~FLAG-16~~ **CLOSED** | Sign-out now clears every account-scoped `todonado.*` key. `todonado.prefs` is deliberately KEPT: sound, chime and start screen are properties of the device, and wiping them would reset a shared laptop every time anyone left. | `src/lib/localState.ts` |

---

## 4. DEPENDENCIES — `npm audit`, reported not fixed

**11 vulnerabilities: 1 critical, 5 high, 5 moderate.**

**Exactly one is a production dependency:**

| Severity | Package | Issue | Status |
| --- | --- | --- | --- |
| moderate | `react-router` / `react-router-dom` | Open redirect via backslash in `<Link>`/`useNavigate` (CVE-2025-68470) | **Not reachable, and hardened anyway** |

Verified by hand today: the app has exactly **one** redirect source
(`LoginPage.tsx:64`, `location.state.from`, which React Router holds in memory and a crafted URL
cannot set), and it passes through `safeRedirectPath`, which explicitly rejects `/\host` — the
exact bypass shape of that CVE — along with `//host`, absolute URLs, `javascript:` and control
characters. Deliberately not blind-upgraded.

The other ten are **dev-only** (`vitest`, `vite`, `esbuild`, `@vitest/mocker`, `vite-node`,
`postcss`, `js-yaml`, `brace-expansion`, `fast-uri`): they affect the test runner and the dev
server, neither of which ships. The critical one is a Vitest UI file-read issue in a UI we do not
run. Taking them means `vitest@4` (a major), which is a chore to schedule, not a launch blocker.

---

## 5. THE TWO RECURRING BUG CLASSES — re-verified

**Class 1 (placeholder ids reaching a uuid FK):** the guard held at every site it modelled, and the
model was too small. Widening it found 11 more (§2). The class is now closed at the write boundary
for `insert`, `upsert`, `update` and `rpc`, with any non-literal payload treated as opaque.

**Class 2 (gates evaluated before their data loads):** `capDecision` holds. Every `FREE_*`
comparison and every `usePlan()` read now folds `billingLoading`. The one remaining fail-open is
the journal recorder's `isPro || billingLoading`, which is deliberate for a button and wrong for a
write — see FLAG-7.

**New this session, reviewed:** `planScope.ts` and `usePlanScope.ts` are pure logic plus a
localStorage read; nothing security-relevant beyond FLAG-16.

---

## 6. WHAT THIS AUDIT DID NOT COVER

Stated plainly, so the gaps are known rather than assumed closed:

- **Supabase platform configuration** — JWT expiry, session timebox, email rate limits, exposed
  schemas, backups, leaked-password protection. A dashboard concern no test can reach; it is
  tracked as an owner action in `docs/LAUNCH_CHECKLIST.md` §3.8.
- **Dependency supply chain** beyond `npm audit` — no provenance or install-script review.
- **Load and denial-of-service testing.**
- **Stripe end to end** — billing is not live, so the webhook was reviewed in source and probed for
  signature enforcement only.
- **Email deliverability**, which is §3.1 and remains UNVERIFIED.
