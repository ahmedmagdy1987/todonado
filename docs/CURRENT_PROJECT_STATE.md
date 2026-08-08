# TODONADO CURRENT PROJECT STATE

**Checkpoint date:** 2026-08-08
**Checkpoint main:** `16f23eabd98c4deefeb30e2857e3ce734e8dad5b`

> This file is the authoritative human-readable checkpoint for the NEXT Claude Code session.
> It is written at a deliberate shutdown point, immediately after PR #23 was merged and deployed.

---

## ⚠️ HOW TO READ THIS FILE

**Everything below is a snapshot, not a live reading.** This repository has a documented history of
state files going stale and then being *believed* — `CLAUDE.md` §7 carries two separate written
corrections where an agent read a "pending migrations" box, took it for the state of the database,
and reported it in a plan having opened no connection at all. `docs/PROJECT_STATE.md` is an
explicitly-dead snapshot for the same reason, and even its "current sources of truth" pointer table
is now itself out of date (it says two migrations are pending; none are).

**So: verify dynamic facts before acting on them.** Every claim here is tagged:

| Tag | Meaning |
| --- | --- |
| **[VERIFIED]** | Checked directly by the agent at the stated time, against the real system |
| **[USER-VERIFIED]** | The owner confirmed it manually. NOT independently checked by the agent. Do not restate it as an API verification |
| **[PENDING]** | Not done. Do not describe it as complete |
| **[DEFERRED]** | Known, deliberately not acted on, needs its own scoped task |

Static facts (design decisions, why something was built a certain way) age well. Dynamic facts
(migration counts, deployment heads, Stripe state, MCP configuration) do not — re-verify those.

---

## VERIFIED COMPLETE

### Focus — pause/resume continuity (PR #23)

**[VERIFIED]** Merged as `16f23ea`; main CI green on all 5 jobs; the compiled fix was confirmed
present in the live production chunks.

Two reported defects, both rounding, neither a clock problem:

- Pause at 24:45 immediately showed 24:44. `elapsedSeconds` floored the current pause separately
  from the gross span, and `Math.floor(-0.3)` is `-1`, so a second was *added* to elapsed on every
  pause.
- Resume jumped up 2–3 s then settled low. `useNow` created its interval without firing it, so the
  screen briefly recomputed from a stale `now` against an already-grown `accumulated_paused_seconds`.

**The first fix was NOT merged, and that matters more than the fix itself.** It passed all 7 CI
checks and every test in the feature. A pre-merge conservation check over many cycles found it was
still wrong: it stamped `paused_at` at the last *render* rather than at the click, which guarantees
the frozen number matches the screen and silently hands the render-to-click gap to the pause.

| Cycles | Focus lost (rejected design) |
| --- | --- |
| 40 | **19.9 s** |
| 200 | **97.9 s** |

A straight line through the origin — ~0.5 s per pause, flowing into `actual_seconds`, Insights, the
weekly review, `estimationBias` and every task's focus total. The countdown looked perfect
throughout.

**Why the existing tests could not catch it:** the single-instant tests in `timer.test.ts` conserve
*by construction* — each defines the pause as starting where it measures it.

**The deployed design:** `useNow(active, phaseMs?)` aims each tick at the instant the derived second
changes (self-rescheduling `setTimeout`, re-derived from `Date.now()` so lateness self-corrects).
Between two renders the displayed value cannot have moved — stale in *time*, never in *value* —
which lets `paused_at` be stamped at the **true click** without the clock appearing to move. The
break clock passes no phase and keeps the plain `setInterval` cadence.

**[VERIFIED]** measured results after the fix:

| Measure | Result |
| --- | --- |
| Pause-driven error, 40 cycles | **~0.535 s** |
| Drift growth | flat, not linear — 40:~0.26 s · 200:~0.30 s · 400:~0.60 s |
| Across 4 clock-skew conditions | identical |
| `actual_seconds` | within 1 s of true focus |
| `accumulated_paused_seconds` | monotonic, integral, never inflated |

One artefact remains and is **asserted rather than hidden**: timers fire a few ms late, so a click
in that sliver freezes on a second the render had not yet shown. It can only ever reveal a second
that genuinely elapsed, never remove one; under 5 % of clicks, `actual_seconds` exact either way.

`src/features/focus/pauseConservation.test.ts` is the committed guard (30 cases, 4 skew conditions,
up to 400 cycles). **Do not delete it as redundant** — it is the only thing that catches this class
of bug.

### Focus — clock-skew countdown fix

**[VERIFIED]** Merged (`a1bb899`), deployed, and still present in production
(`Number.isFinite(t)?Math.min(t,e):e`). Root cause: PostgreSQL `started_at` compared against the
browser clock. The anchor is **pinned once per session id** — recomputing per render while the
server value is ahead would advance the anchor with the clock and the timer would never move at all.
Server persistence and reload recovery are unchanged.

### Focus — optional countdown ticking

**[VERIFIED]** Merged (`64f0ba6`), deployed. Optional · **default OFF** (`tick:!1` confirmed in the
production bundle) · independent of the end chime · Web Audio, no audio file · **no second
timer/clock** · pauses with Pause · resumes with Resume when enabled · stops on End early and on
completion · respects the master sound switch.

Deployed tick tuning **[VERIFIED in production assets]**: **900 Hz**, gain multiplier **0.075**,
~**45 ms** envelope (raised from 1150 Hz / 0.035 / ~25 ms, which was inaudible in a normal room).
`sound.test.ts` pins the ceiling below the quietest chime — if it is still too quiet, the answer is
the **volume slider**, not the constant. **End-of-session chime unchanged** (`freq:1046.5/330/440/
660/880`, `peak:.1/.12/.14` all confirmed unchanged in production).

### Focus — database / PostgREST path

**[VERIFIED]** Working in production. A real `POST /rest/v1/focus_sessions?select=*` returned
**201 Created**. The earlier observed 403 **could not be reproduced afterward and was never root
caused**. Production grants and RLS were audited and found correct; **no permission widening was
made**. If the 403 recurs, treat it as unexplained and investigate — do not assume it is fixed.

### Focus — request model

**[VERIFIED]** **No polling exists.** The repeated `focus_sessions` GETs seen in DevTools are one
invalidation/refetch **per user action** (each mutation's `onSettled`), not timer cadence. No
`refetchInterval`, `refetchOnWindowFocus` false, `staleTime` 30 s, realtime does not subscribe to
the table. All four refetch options confirmed **absent** from the deployed query chunk.
`src/features/focus/focusTraffic.test.ts` pins this structurally.

### Billing — Issue #8 (Test/Sandbox cleanup)

**[VERIFIED]** Completed and closed. The production Test/Sandbox cleanup removed **1 Test billing
row** and **3 Test `checkout_attempt` rows**. Post-cleanup: billing Test rows = **0**, checkout Test
rows = **0**. No unrelated user or application data was changed. Founding/manual Pro entitlement
behaviour remained intact (a blanket `DELETE` was explicitly forbidden and not performed).

### Calendar security — Issues #9, #10, FLAG-5 / #18

**[VERIFIED]** All three closed. Completed work:

- outbound source/fan-out limits · concurrency controls · per-source timeout · aggregate deadline
- URL and response size limits
- SSRF protection · DNS-rebinding protection · request-scoped IP pinning · redirect revalidation ·
  safe TLS hostname verification
- durable per-user calendar source cap = **10**, enforced race-safely under `pg_advisory_xact_lock`
- structural write-time URL validation · duplicate URL protection
- **no DNS at write time**; fetch-time SSRF remains authoritative
- the `webcal://` integration bug fixed end-to-end (proved by negative control: without the fix the
  fetch spy fires **0** times)

### Function ACL security audit

**[VERIFIED]** Production public functions were audited. Five Stripe money-path functions are
`SECURITY DEFINER` and **service_role-only**:

`apply_stripe_billing_event` · `apply_stripe_subscription_event` · `bind_verified_checkout` ·
`mark_checkout_attempt` · `reserve_checkout_attempt`

**No anon/authenticated/PUBLIC EXECUTE reaches the billing money path. No Critical function-ACL
blocker was found before Stripe Live configuration.**

---

## CURRENT PRODUCTION STATE

| Item | Value |
| --- | --- |
| Production URL | https://www.todonado.com |
| Supabase project | `lplsbfduankkpglyusjp` |
| Main at checkpoint | `16f23eabd98c4deefeb30e2857e3ce734e8dad5b` |
| Main CI after PR #23 | **GREEN** (5/5 jobs) **[VERIFIED]** |
| Repo/remote at checkpoint start | clean and synchronized **[VERIFIED]** |
| Deployed code | includes the Focus pause/resume continuity fix **[VERIFIED in production assets]** |

**[VERIFIED]** Site health at checkpoint: `/`, `/pricing`, `/login`, `/welcome` all HTTP 200;
enforcing CSP and HSTS present.

### Migrations

**[VERIFIED at FLAG-5 deployment, 2026-08-08]**

| | |
| --- | --- |
| Production migration count | **37** |
| Repository migration count | **37** |
| Latest production migration | `20260808120000_calendar_sources_write_guard` |
| Drift | none at last verified state |

> **Re-verify before relying on this.** Use the reconciliation query in `docs/BILLING_SETUP.md` §02.1
> or query `supabase_migrations.schema_migrations` directly. A file in `supabase/migrations/` is not
> evidence, and neither is this table.

### Stripe

**Production is configured for LIVE.**

| Item | Value |
| --- | --- |
| Live product | Todonado Pro |
| Prices | **$5 USD / month**, **$48 USD / year** |
| Published UI | $5/month · $48/year · $4/month annual equivalent · 20 % savings |
| Webhook endpoint | `https://www.todonado.com/api/stripe-webhook` |
| Configured events | `checkout.session.completed` · `customer.subscription.updated` · `customer.subscription.deleted` |
| Preview environment | remains the Stripe **TEST** lane |

**[VERIFIED]** The production client bundle carries `pk_live_` mode, the Live monthly Price ID and
the Live yearly Price ID, with **no stale Issue #8 Test Price IDs**.

**[USER-VERIFIED]** The webhook endpoint configuration and the Vercel Stripe environment switch to
Live (with redeploy) were confirmed manually by the owner. These were **not** independently verified
by the agent through the Stripe API, and must not be restated as if they were.

---

## PENDING MANUAL VERIFICATION

### 1. Focus pause/resume manual test — **[PENDING]**

**The deployed PR #23 code was verified in the production assets, but the final manual pause/resume
behaviour test has NOT been completed by the user.** Do not describe the Focus work as fully
verified until this passes.

Procedure:

1. Start a short Focus session.
2. Observe a displayed value such as **24:45**.
3. Press **Pause**. → the frozen value should remain continuous, with **no artificial −1 second jump**.
4. Wait several seconds.
5. Press **Resume**. → **no +2/+3 second jump**, **no backward jump**, countdown resumes
   continuously, and after approximately one real second it decrements **once**.
6. Repeat Pause/Resume several times.
7. Listen to the new **900 Hz** countdown tick and decide whether its loudness is acceptable.

> **Do not reopen the timer implementation unless the manual production test demonstrates a real
> remaining defect.** The arithmetic is covered by 30 committed conservation cases across 4 skew
> conditions and up to 400 cycles.

### 2. First real Stripe Live payment — **[PENDING]**

**NO real Live payment has been completed yet. Stripe Live is NOT end-to-end payment verified.**

When a payment method is available, use the **$5/month** subscription as the first low-risk
real-payment test. Then verify **read-only**:

- one `cs_live_` checkout attempt
- consumed terminal attempt
- exactly one `billing` row for the payer
- `plan = pro`
- `subscription_status = active`
- customer id present
- subscription id present
- `last_stripe_event_id` present
- no Test IDs
- no duplicate subscription/billing state

Then test the **Customer Portal and cancellation separately**.

---

## DEFERRED / NON-BLOCKING

### Function ACL hygiene — **[DEFERRED]**

`project_workspace(uuid)` and `section_workspace(uuid)` carry unnecessary — but low-impact — `anon`
EXECUTE exposure. Not a blocker; not changed during the Live transition.

### Supabase default-privilege hygiene — **[DEFERRED]**

New public functions and tables can inherit broader privileges than desired via Supabase's
`ALTER DEFAULT PRIVILEGES`. This was **NOT changed during the Live transition**.

> **Do not silently apply these privilege changes later.** Handle them deliberately, as a separate
> scoped migration and review. Note the related standing warning in `CLAUDE.md` §7: do **not** "fix"
> a future 42501 by re-widening default privileges — add a narrow grant in a new migration instead.

### CSP font warning — **[VERIFIED, no action needed]**

The observed font CSP warning was **not caused by Todonado**. The deployed CSP correctly allows the
app's Google font sources, and no Todonado CSS/JS font URL violated the app policy; the warning was
associated with the Stripe Checkout / another page context. **CSP was intentionally NOT weakened.**

### Dependency audit — **[VERIFIED at last check]**

`npm audit` reported **12 total · 1 critical · 6 high · 5 moderate**. No runtime Critical/High
vulnerability was found reachable in the production dependency tree — the Critical/High items were
in development/build tooling. This did not block Stripe Live configuration.

> **Do not run `npm audit fix --force` blindly in a future session.**

---

## SUPABASE MCP STATE

**[VERIFIED at removal]** The temporary production **write** MCP used for the approved migration and
cleanup was **removed** after Issue #8 was closed.

Expected normal configuration: **only a project-scoped READ-ONLY Supabase MCP**, pinned to
`lplsbfduankkpglyusjp`.

> **Do NOT recreate a write-capable production MCP** unless a future task carries explicit
> production-write approval.
>
> **The next session must VERIFY the MCP configuration rather than assume it survived the restart.**
> A read-only handle is the intended state; if any write-capable handle appears, stop and confirm
> before using it.

Related: the Supabase **CLI** in the agent shell is logged into a *different* account and cannot see
this project. Do not "fix" that by linking or logging in — use the read-only MCP or the SQL editor.

---

## IMPORTANT OPERATING RULES

- **No `supabase db push` against production.** An agent must never run it, whatever it believes the
  migrations folder contains.
- **Production migrations require explicit review and approval.**
- **Never expose or print Stripe/Supabase secrets** — tokens, webhook secrets, service-role keys,
  database passwords.
- **Production Preview and Live Stripe environments must stay intentionally separated.** Preview
  remains Stripe **TEST**; production is Stripe **LIVE**.
- **No real payment should be created accidentally.**
- **Use read-only production verification wherever possible.**
- **Code-only PRs require green CI before merge.**
- **Migration or data-impact work requires explicit review.**

---

## NEXT SESSION START HERE

Exactly this order:

1. Restore/verify GitHub authentication if required.
2. Verify repository `main` against GitHub.
3. Read this `CURRENT_PROJECT_STATE.md` completely.
4. Verify only the read-only Supabase MCP is configured.
5. Perform the pending **manual Focus pause/resume + tick loudness test**.
6. If the Focus manual test passes, **do NOT change Focus further**.
7. When a real payment method becomes available, perform the first **$5/month Stripe Live payment**.
8. Immediately verify Live checkout/webhook/billing state **read-only**.
9. Test Customer Portal / cancellation afterward.
10. Handle the deferred Supabase default-privilege / anon-function hygiene **only** as a separate
    reviewed security task.

---

## RELATED DOCUMENTS

| Question | Read |
| --- | --- |
| What is built, and how does it work? | `CLAUDE.md` §3 |
| Which migrations are applied? | **Query the database.** `CLAUDE.md` §7 for context, `docs/BILLING_SETUP.md` §02.1 for the reconciliation query |
| Billing turn-on runbook | `docs/BILLING_SETUP.md` |
| What is left before launch? | `docs/LAUNCH_CHECKLIST.md` |
| Security review findings | `docs/AUDIT_2026-07-31_final.md`, `docs/AUDIT_2026-07-31_prelaunch2.md` (FLAG-5) |
| Historical reasoning (dead snapshot) | `docs/PROJECT_STATE.md` — its own pointer table is stale |
