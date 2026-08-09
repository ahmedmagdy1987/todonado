# TODONADO CURRENT PROJECT STATE

**Checkpoint date:** 2026-08-09
**Checkpoint main:** `609f549095749a8ebc54298762b88ec4d1d9fbe1`

> This file is the authoritative human-readable checkpoint for the NEXT Claude Code session.
> It is written at a deliberate shutdown point, immediately after PR #25 and PR #26 were merged
> and deployed. (The previous checkpoint was written at `16f23ea`, after PR #23.)

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

### Focus audio — the tick was SILENT, and the cause was not the volume (PR #25)

**[VERIFIED]** Merged as `da36fd1`, main CI green on all 5 jobs, deployed, and the compiled fix
read back out of the production bundle. **[USER-VERIFIED]** the sounds themselves, by ear.

The countdown tick had been raised twice for being inaudible (0.035, then 0.075) and was still
reported inaudible in production with the control switched on. **It was not quiet, it was silent,
and no amount of gain would ever have fixed it.** Two independent causes, each sufficient on its
own, and neither raises an error anywhere:

| # | Cause | Fix |
| --- | --- | --- |
| 1 | **The envelope was scheduled in the past.** `AudioContext.currentTime` is the frame AFTER the block the audio thread has already rendered. The tick scheduled its whole 45 ms envelope starting at exactly `currentTime`, from inside a React commit, on the one frame per second when the main thread is busiest. By the time the graph was evaluated those events had expired, so the gain param skipped the ramp to peak and took its `0.0001` tail value | `SCHEDULE_LEAD_SECONDS` = 25 ms, applied to the tick and the confirmation only |
| 2 | **The context was never unlocked.** `tick` is a PERSISTED preference, so the common path is: already on, page reloaded mid-session, first `playTick()` runs from a timer effect with no gesture near it. The autoplay policy starts that context suspended, the unawaited `resume()` never takes effect, `currentTime` stays frozen at 0 | `unlockAudio()` from the toggle click, plus `installAudioUnlock()`, a one-shot gesture listener as the backstop |

**Why the end chime never showed the symptom:** its notes ring for 0.5-1.1 s, so losing a few
milliseconds off the front of a bell is inaudible. Off a 45 ms tick it is the whole tick.

**The lead fixes both** — events a lead ahead of a frozen `currentTime` are still in the future
when `resume()` lands.

**Retuned for character, not level.** `TICK_PEAK` is UNCHANGED at 0.075. The body moved 900 to
660 Hz (small speakers roll off above ~1 kHz) and gained a 12 ms bandpassed noise transient at
2.4 kHz. A real clock tick is broadband, which is what makes it read as a tick rather than a beep,
and no oscillator can produce it. Body plus transient still lands below the quietest chime.

**Interruption confirmation sound** added: two non-overlapping rising notes (523/784 Hz), ~150 ms,
peak 0.09, sitting between the tick and the quietest chime. It is emitted from `onSuccess` and
nowhere else, so it means RECORDED and not PRESSED. The click unlocks audio (the only moment user
activation exists) and the success plays it. **Failure plays nothing.** A second click while a log
is open is dropped, which also stopped two clicks writing the same `interruptions + 1` from one
rendered value.

> **THE LESSON, AND IT IS WORTH MORE THAN THE FIX.** The old suite only ever asserted CONSTANTS.
> `TICK_PEAK` was correct the entire time, which is how a completely silent feature stayed green
> through two releases. **When a synthesised sound is reported inaudible, prove a sample was
> rendered before retuning it.** A Web Audio graph that is built, connected and started correctly
> still produces exact silence if its envelope is scheduled in the past or its clock is not
> running. `audioHarness.ts` now records the graph that is actually built, and the regression test
> asserts every event is scheduled strictly after `currentTime`.

### Focus audio controls — labelled, and `aria-pressed` corrected (PR #26)

**[VERIFIED]** Merged as `609f549`, main CI green on all 5 jobs, deployed, and the descriptor logic
read back out of the production bundle.

The two controls were functionally correct and unreadable: a speaker icon beside a clock icon,
neither labelled. A speaker universally reads as "all sound", so the control governing the LEAST
(only the chime at the end) looked like the one governing everything.

- Visible labels **End chime** and **Countdown tick** from `sm` up; hidden below that, where the row
  has no space for five labelled controls. `aria-label` and `title` are unconditional, so the narrow
  layout loses the visible word and nothing else.
- Both moved onto the `Button` primitive, which restored the **44px touch target** (they were 32px
  bare `<button>`s) and matched them to Pause / Log interruption / End early.
- Active is `secondary` (a filled surface), inactive is `ghost`. No new colour, and both stay
  visually behind the three primary actions.

> **`aria-pressed` IS THE PREFERENCE, NOT THE AUDIBILITY, AND THE FIRST VERSION HAD IT BACKWARDS.**
>
> It was implemented as `enabled && masterSound`, reasoning that a control should not claim to be on
> while nothing can be heard. `aria-pressed` reports THE STATE THE BUTTON CHANGES, and these buttons
> change one preference each; the master "Sounds & notices" switch is a different control on a
> different screen that neither can touch. With the tick preference ON and the master switch OFF the
> old code gave: `aria-pressed` **false**, a label reading "tap to **play**", a press that turned the
> preference **OFF**, and `aria-pressed` **still false** afterwards. The state was misreported, the
> label instructed the opposite of what the press did, and to anyone relying on the announced state
> the button did nothing at all. **A toggle whose reported state cannot change is a broken toggle.**
>
> `pressed` is now the preference alone. Audibility moved to `audible` (drives the Volume2/VolumeX
> icon) and `mutedByMaster` (drives a subtle `opacity-60`), where it cannot corrupt the state.
> `pressResult` exists so the toggle contract is a test rather than a promise.

The copy no longer conflates **OFF** with **ON BUT GLOBALLY MUTED**. They need different actions
(one is fixed by the button, the other only in Settings), so one message cannot serve both without
sending somebody the wrong way. The both-off case also states that turning it on alone will still be
silent, which otherwise makes the press look broken. **The master switch never erases a stored
preference** — pinned by test.

`audioControls.test.ts` covers the full four-state matrix for BOTH controls (20 cases): visible
label, `aria-pressed`, `aria-label`, `title`, and the result of pressing. It also pins the naming
rule that motivated the change: **neither control may ever be labelled "Sound" or "Audio" on its
own**, since those are the vague words that caused the ambiguity and are exactly what a future edit
reaches for when the row feels crowded.

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

> ⚠️ **THE TUNING RECORDED HERE IS SUPERSEDED BY PR #25** (see the top of this file). This section
> describes the state at the 2026-08-08 checkpoint and is kept for history.

Tick tuning at THAT checkpoint: **900 Hz**, gain multiplier **0.075**, ~**45 ms** envelope (raised
from 1150 Hz / 0.035 / ~25 ms, which was inaudible in a normal room). **It was still completely
silent in production, and the reason was the scheduling, not the level** — PR #25 has the analysis.
The tick is now a **660 Hz** body plus a bandpassed noise transient at 2.4 kHz, with `TICK_PEAK`
unchanged at 0.075.

`sound.test.ts` pins the ceiling below the quietest chime — if it is still too quiet, the answer is
the **volume slider**, not the constant. **End-of-session chime unchanged throughout both PRs**
(`freq:1046.5/330/440/660/880`, `peak:.1/.12/.14` all re-confirmed in production after PR #26).

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
| Main at checkpoint | `609f549095749a8ebc54298762b88ec4d1d9fbe1` |
| Main CI after PR #26 | **GREEN** (5/5 jobs) **[VERIFIED]** |
| Last Production deployment | id `5817947701`, sha `609f549`, state success **[VERIFIED]** |
| Repo/remote at checkpoint | clean and synchronized, 0/0 **[VERIFIED]** |
| Deployed code | includes the Focus audio playback fix, the interruption confirmation sound and the labelled audio controls **[VERIFIED in production assets]** |

**[VERIFIED]** Site health at checkpoint: `/`, `/pricing`, `/login` all HTTP 200; enforcing CSP and
HSTS present.

**[VERIFIED]** Merge history for this session: PR #25 merged as
`da36fd1ddf17463cb107ae2c0b30c5277ab3d7cb`, PR #26 merged as
`609f549095749a8ebc54298762b88ec4d1d9fbe1` (current main). Both branches are fully merged and carry
no unique work.

> **A CHUNK HASH CHANGING IS NOT EVIDENCE THAT ITS CODE CHANGED.** After PR #26 the deployed
> `sound-*.js` and `timer-*.js` chunks had new content hashes even though neither source file was in
> the diff. Both turned out to be **byte-identical after stripping the one import line**, whose
> target had been renamed because the ENTRY chunk's hash moved (`index-NHqnLtyO` to
> `index-CQIrbnU4`). Sound chunk 2906 bytes before and after; focus timer chunk 1252 bytes before
> and after. Check the content before concluding either way.

### Migrations

**[VERIFIED 2026-08-09 11:07 UTC via the read-only MCP]**, re-queried at this checkpoint rather than
restated from the previous one.

| | |
| --- | --- |
| Production migration count | **37** |
| Repository migration count | **37** |
| Latest production migration | `20260808120000_calendar_sources_write_guard` |
| Drift | **none** — all 37 recorded versions match the 37 files one-for-one |

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

### 1. Focus pause/resume and audio manual test — **[USER-VERIFIED, DONE]**

**This has PASSED and is no longer pending.** The owner confirmed manually, on 2026-08-09:

- no old −1 second jump on Pause
- no +2/+3 second jump on Resume
- countdown preview tick audible, and repeated ticking audible
- reload plus a user interaction unlocks audio correctly
- Pause silences ticking, Resume restores it
- Log interruption confirmation sound works
- end chime still works independently
- sound levels acceptable

> **DO NOT REOPEN FOCUS — timer or audio — unless a NEW real bug is observed in production.** The
> timing arithmetic is covered by 30 committed conservation cases across 4 skew conditions and up to
> 400 cycles; the audio path is covered by the graph-recording harness described above. Both have
> now also been confirmed by ear on real hardware.

### 2. First real Stripe Live payment — **[PENDING]**

**NO real Live payment has been completed yet. Stripe Live is NOT end-to-end payment verified.**

**Production remains configured for LIVE. No Stripe configuration was changed during the Focus
audio work** (PR #25 and PR #26 touched only `src/features/focus/`).

**[VERIFIED 2026-08-09 11:07 UTC, read-only]** Production money-path state at this checkpoint:

| Table | Rows | Note |
| --- | --- | --- |
| `billing` | **0** | no payment has ever landed |
| `checkout_attempts` | **1** | see below |
| `calendar_sources` | **0** | |

**The one `checkout_attempts` row is an ABANDONED Live checkout, and it is expected.** Status
`session_created`, a `cs_live_` session, price `price_1U26tR…`, **subscription id null**, created
**2026-08-08 11:35:20 UTC** by `blu***@gmail.com`. It is consistent with opening the Live checkout
page to confirm the Live price IDs render, and abandoning it. No payment was made. **Do not delete
it** — no Production cleanup is approved.

> **IT SELF-HEALS, AND NOTHING NEEDS DOING.** `reserve_checkout_attempt` returns an open attempt
> as-is at its ORIGINAL price, so while the Stripe session is still open that user is returned to
> it. Stripe expires a Checkout Session after 24 hours (so this one from ~11:35 UTC on 2026-08-08),
> after which `api/create-checkout-session.ts` takes its state FROM STRIPE, never from a local TTL:
> it marks the attempt `expired` and reserves a fresh one at the requested price. If the first Live
> payment is made from that same account, just confirm the interval shown on the Checkout page.

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

## MACHINE

**[VERIFIED 2026-08-09]** The working machine changed. The current paths are:

| | |
| --- | --- |
| Windows user root | `C:\Users\CCBoot` |
| Repository | `C:\Users\CCBoot\Documents\projects\todonado` |

> **`C:\Users\bdstd` IS NO LONGER THE CURRENT PATH.** `CLAUDE.md` §7's restore instructions still
> name it in the clone step; read that as "clone into your own `Documents\projects`", not as a
> literal path. The repo is identical either way.

The per-repo git identity had to be set by hand on this machine before the first commit
(`user.name` / `user.email` per `CLAUDE.md` §7 step 3) — a fresh Windows profile does not carry it,
and the first commit fails with "Author identity unknown" until it is set.

## SUPABASE MCP STATE

**[VERIFIED 2026-08-09]** A project-scoped **READ-ONLY** Supabase MCP is configured and working on
the `CCBoot` machine, and it is the ONLY Supabase MCP present:

| | |
| --- | --- |
| Server name | `supabase` |
| Transport | http, `https://mcp.supabase.com/mcp?project_ref=lplsbfduankkpglyusjp&read_only=true&features=database` |
| Project ref | `lplsbfduankkpglyusjp` |
| `read_only` | **true** |
| Database role | `supabase_read_only_user`, `transaction_read_only = on` **[VERIFIED by query]** |
| `supabase-write` | **NOT configured** |

Config lives in `C:\Users\CCBoot\.claude.json` under the project entry, not in a tracked `.mcp.json`.

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

1. Read this `CURRENT_PROJECT_STATE.md` completely.
2. Reverify the dynamic facts rather than trusting them: `main` against GitHub, and Production state
   via the read-only MCP (migration count, latest migration, `billing` / `checkout_attempts` counts).
   Every table above is a snapshot.
3. Restore/verify GitHub authentication if required (`gh auth setup-git` before the first clone; see
   `CLAUDE.md` §7 for the two distinct failure modes).
4. Verify only the read-only Supabase MCP is configured, and that no write-capable handle appeared.
5. **Do NOT reopen Focus** — neither the timer nor the audio — unless a NEW real bug is observed in
   production. Both are now deployed, test-covered and manually confirmed by ear.
6. When a real payment method becomes available, perform the first **$5/month Stripe Live payment**.
7. Immediately verify Live checkout/webhook/billing state **read-only** (the checklist above).
8. Test Customer Portal / cancellation afterward.
9. Handle the deferred Supabase default-privilege / anon-function hygiene **only** as a separate
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
