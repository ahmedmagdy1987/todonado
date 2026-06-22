# Todonado — Whole-project state & honest assessment

> **Date:** 2026-06-23 · **Commit:** `bd2db67` (`main`) · **Scope:** the entire repo as it stands today.
> Assessment only — no app code changed.
>
> **Why this doc exists:** `docs/PRODUCT_AUDIT.md` and `docs/READINESS_CHECKLIST.md` (both dated
> 2026-06-15, baseline `538bb6d`) are now **substantially stale** — **32 commits** shipped since,
> building most of what they listed as "missing" (Insights, Settings, legal pages, landing/pricing,
> effort chips, ErrorBoundary, search-facade removal) plus a full security-audit pass
> (`docs/AUDIT_2026-06-22.md` + `_followup.md`). This doc reconciles the picture to **today** and does
> **not** re-derive what those still cover.
>
> **Honesty legend:** **[FACT]** verifiable in code/DB (cited) · **[INFERENCE]** reasoned from code ·
> **[HYPOTHESIS]** about users/market/pricing/demand — **there is still zero real user data in this
> repo; every such claim is an unvalidated guess.** No conversion rates, retention numbers, market
> sizes, or benchmarks are invented below.

---

## 1. Where the project really is (the honest verdict)

**[FACT + INFERENCE]** Todonado is a **competently engineered, visually premium, single-user web
planner** whose one real idea — an effort-aware daily **capacity meter** (`src/features/today/capacity.ts`,
`CapacityMeter.tsx`) with calm one-tap roll-over (`rollover.ts`) — is now surrounded by a credible
shell: a real (Pro-gated) **Insights** dashboard (`src/features/insights/insights.ts`), **effort
chips** so estimation is no longer a bare number box (commit `f5c88de`), a **Settings** page, **legal
pages**, a **landing + pricing** surface with willingness-to-pay fake-doors (`upgrade_intents`), a
**templates** catalog, the **wellness** suite, and a genuinely hardened data layer (RLS owner-only on
every table, atomic `complete_task` RPC, email-only login, global mutation-error toast). The craft is
real and the last two weeks closed most of the *engineering* gaps the June-15 audit named. **The
single biggest risk to it succeeding is unchanged and is not technical: there are zero users and zero
evidence anyone will adopt or pay for it, layered on top of a wedge whose core behavioral assumption —
that people will keep entering `effort_minutes` and let the meter change a decision — has never been
tested with a real human.** There is still **no analytics** (`F1`), **no retention engine** (no
service worker, web-push, reminders, or streaks — grep-confirmed absent), and the most defensible
Insights metric (estimate-vs-actual-focus bias) isn't built even though the data exists. **Honest
call:** the *codebase* is well worth continuing — it's a strong, disciplined foundation. The *current
direction* is worth continuing **only if the next move is validation, not more building**: ship
instrumentation and put it in front of real over-committers. Continuing to build features (especially
billing, collaboration, AI) before that is the main way this wastes time and money.

---

## 2. What's BUILT (current inventory + quality)

> Reconciled to `bd2db67`. "Solid" = works, tested, on-thesis. "Weak/half-baked" = present but shallow,
> stubbed, or inert.

**Core — Today / Inbox / Projects / Capacity** · **[FACT] solid.** `computeCapacity` (empty/ok/near/over,
clamped) and `suggestTasksToMoveTomorrow` (minimal-deferral) are the differentiated logic and are pure +
unit-tested (`capacity.ts`, `today/capacity.test.ts`). Full task CRUD with optimistic TanStack-Query
mutations + rollback (`useTaskMutations.ts`), Inbox capture, Projects → sections → subtasks with
fractional-position drag-reorder, realtime sync (`ENABLE_REALTIME`). Per-view sort modes + priority
quick-filter (`598e8ad`). **Weak:** `useTasks`/`useFocusSessions` still appear to `select('*')` unbounded
(scale cliff `E2`; **[INFERENCE]** — no commit since the audit addresses it); task/subtask **delete still
appears one-click with no confirm/undo** (`C2` — grep finds no confirm in `TaskRow`/`SubtaskList`;
**[INFERENCE]**), and a task delete cascades its subtasks (`initial_schema.sql:118`, **[FACT]**).

**Focus** · **[FACT] solid.** Drift-resistant task-bound timer, pause/resume, interruption logging,
recorded sessions (`focus_sessions`), accumulated focus time on task rows. **Weak:** timer trusts
`Date.now()` with no clock-skew guard (`E12`/audit H3, **[FACT]**, narrow trigger, untested).

**Insights** · **[FACT] built, Pro-gated, but shallower than its own goal.** `computeInsights`
(`insights.ts`, 15 unit tests) produces a daily planned-vs-completed-effort series with capacity %/status,
focus stats (sessions/seconds/interruptions/completion rate), and rollover/slip stats — with skeleton /
empty / data states (`InsightsPage.tsx`). **Honest gap:** it compares planned effort to *completed
effort* and reports a *conservative* slip rate (its own code flags the missing scheduling-history table),
but it does **not** compute the **estimate-vs-actual-focus bias** ("you underestimate by ~X%") — the single
most defensible metric — even though `focus_sessions.actual_seconds` is right there. So the
"estimate→actual flywheel" (`A3`) is **half-built**.

**Effort capture** · **[FACT] partially done (`A1`).** One-tap effort chips shipped (`f5c88de`) and the
meter now distinguishes un-estimated from empty (`A2`). **Weak:** no natural-language parse and no
history-seeded auto-estimate yet — the highest-leverage capture upgrade is still open.

**Templates** · **[FACT] solid, flagged.** Effort-tagged catalog (`templates/catalog.ts`, large) + apply
logic + tests, behind `FEATURES.templates`. Content-only, no DB. Note: template apply is non-transactional
(audit M5) — a mid-apply failure can orphan a half-built project (**[FACT]**).

**Wellness ("Focus & Calm")** · **[FACT] built, flagged, one inert by design.** Breathwork (real pacer),
supplement/medication tracker (owner-only CRUD, `wellness_items`/`wellness_logs`, unit-tested streaks),
and a shared `AudioPlayer`. **The audio players are "coming soon" placeholders: NO licensed/CC0 audio is
bundled** — every track ships with empty `src` until files are dropped in `public/audio/`
(`public/audio/README.md`). So Sleep sounds + Guided meditation are non-functional content shells today.

**Account / auth** · **[FACT] solid + recently hardened.** Email-only login (the `resolve_login_email`
username→email enumeration RPC was dropped live — `20260622150000`), magic-link now sets
`shouldCreateUser:false` with non-enumerating copy (`F2`), generic sign-in errors, global mutation-error
toast (`H6`, `queryClient.ts`), atomic `complete_task` RPC (`H5`), month-end recurrence anchor (`H2`),
ErrorBoundary (`App.tsx`, `components/common/ErrorBoundary.tsx`). **Settings** (`SettingsPage.tsx`): edit
name/username, **email read-only (no change)**, capacity, plan view, **JSON export** (`exportData.ts`,
real). **Weak/stub:** **account deletion is an honest stub** ("Automated account deletion isn't enabled
yet" → toast only, no delete — `SettingsPage.tsx:300-316`); **no password reset** (forgotten password =
lockout, **[FACT]**).

**Commercial layer** · **[FACT] deliberate fake-door, NOT real billing.** `usePlan().isPro` is resolved
client-side by a **founding-email allowlist + localStorage/`VITE_PRO_PREVIEW` override** (`billing/plan.ts`
`resolvePlan`) — there is **no Stripe, no entitlement column, no server-side gating**. Insights' "Pro gate"
is therefore cosmetic (anyone can set `localStorage todonado.plan=pro`); it's harmless because Insights only
renders the user's own RLS-protected data. Landing + pricing pages encode a **[HYPOTHESIS]** $6/mo Pro tier
(`marketing/plans.ts`) and paid CTAs only record `upgrade_intents` (insert-only, **no read-back** — so the
demand signal can't even be seen in-app without SQL).

**Legal** · **[FACT] present, placeholder contact.** Privacy + Terms pages exist (`features/legal/`), but
`LEGAL_CONTACT = '[your contact email]'` (`LegalLayout.ts:15`) — the contact is unfilled; no DPA, cookie
policy, or consent banner.

**Recent audit fixes (this week)** · **[FACT] real and verified.** Security/correctness audit
(`AUDIT_2026-06-22.md`) + follow-up: H1/H2/H5/H6 closed and live-verified; F2 (magic-link) + F4 (Retry
duplicate-row, `noRetry`) fixed; F1 (`complete_task` anon-execute) closed by a **committed-but-unapplied**
migration `20260622160000` (run its SQL — see that doc). RLS confirmed owner-only on all 12 tables via live
anon probes.

---

## 3. What's MISSING FROM THE PRODUCT (experience/quality gaps)

> Prioritized. "Genuinely matters" = the product feels broken/thin without it. "Nice-to-have" = polish.

### Genuinely matters
1. **A retention hook of any kind — [FACT] there is none.** No service worker, web-push, reminders,
   streaks, or end-of-day review anywhere in `src/` (grep-confirmed). A "daily command center" with no
   mechanism to bring you back relies entirely on a pre-existing habit. This is the biggest *product* hole.
2. **The estimate→actual bias metric in Insights — [FACT] data exists, metric doesn't.** The one number
   that makes the meter compounding and sticky ("you underestimate by ~40%") isn't computed. Insights today
   shows trends, not the personal calibration that justifies the whole effort-estimation chore.
3. **Low-friction estimation depth — [FACT] partial.** Chips shipped, but no natural-language parse and no
   auto-estimate from the user's own focus history. The wedge's key input is still mostly manual, and a
   skipped estimate quietly weakens the meter.
4. **Destructive-action safety — [INFERENCE] task/subtask delete still one-click, no confirm/undo** (audit
   `C2`). On a misclick a task + its subtasks are gone. Account-delete has a confirm modal but is a stub.
5. **Insights honesty ceiling — [FACT]** there's no scheduling-history table, so "slipped/planned" is a
   conservative lower bound (its own code says so). Real plan-vs-actual needs that log, and history can't be
   reconstructed later.

### Nice-to-have
6. **Audio content for the wellness players** — [FACT] inert until licensed/CC0 files are added; the two
   audio modules are shells today.
7. **Inbox triage** — only schedule-to-today per row; no bulk select or arbitrary-date scheduling without the
   full dialog (`C4`).
8. **Account completeness** — email change, password change-while-logged-in (`D3`/`D4`).
9. **Import** (Todoist/TickTick/CSV) and an ICS/CSV export to complement the JSON dump.
10. **Accessibility polish** — keyboard list nav, `prefers-reduced-motion` (`C6`).

---

## 4. What's MISSING FOR LAUNCH

### (A) TECHNICAL launch-readiness

| Item | Status (today) | Verdict |
| --- | --- | --- |
| **Analytics / activation funnel (`F1`)** | **[FACT] absent** (no PostHog/Mixpanel/GA in `src`) | **Real blocker for a meaningful beta** — without it you learn nothing from users you onboard. |
| **Real billing — Stripe + entitlements + server gating (`D1`/`D2`)** | **[FACT] fake-door only** (`plan.ts` email allowlist) | **Hard blocker to charge.** Not needed for a free soft beta. |
| **Password reset (`D4`)** | **[FACT] none** | **Blocker before real users** — forgotten password = permanent lockout. Cheap (`S`). |
| **Account deletion (`D5`)** | **[FACT] honest stub** | **Blocker before charging EU/CA users** (GDPR/CCPA). Needs an Edge Function (client can't delete the auth user). |
| **Legal pages contact/DPA (`E7`)** | **[FACT] pages exist, `LEGAL_CONTACT` placeholder, no DPA/consent** | Fill `LEGAL_CONTACT` now (trivial). DPA/consent banner needed before charging + before analytics cookies. |
| **Transactional email / SMTP (`D7`/`D10`)** | **[FACT] only Supabase built-in auth mail** | **Reliability risk for signup at volume.** Fine for a tiny beta; needed before scaling/charging (deliverability, receipts). |
| **Error tracking / observability (`E9`)** | **[FACT] none** (no Sentry/`captureException`) | Nice-to-have for a tiny beta; **needed before charging** — first paid bug is otherwise invisible. ErrorBoundary exists but reports nowhere. |
| **CI pipeline (`E3`)** | **[FACT] no `.github/`** — gates run manually | Not a user-facing blocker; **needed before charging** to stop regressions. |
| **Audio files (wellness)** | **[FACT] none bundled** | Not a launch blocker (flag-gated suite); the two audio modules just stay "coming soon." |
| **Query windowing (`E2`)** | **[INFERENCE] still unbounded** | Not a blocker at beta scale; a real cliff before growth. |
| **F1 grant migration (`20260622160000`)** | **[FACT] committed, not applied** | Apply the SQL (defense-in-depth; RLS-contained today). |

**Soft-beta (free, ~10–50 invited users) blockers:** analytics (`F1`), password reset (`D4`), fill
`LEGAL_CONTACT`, apply the F1 grant SQL. Everything else can wait.
**Before charging a dollar:** real billing (`D1`/`D2`), account deletion (`D5`), DPA/consent (`E7`),
transactional email + deliverability (`D7`/`D10`), error tracking (`E9`), CI (`E3`).

### (B) NON-TECHNICAL launch-readiness — the dominant risk

**[HYPOTHESIS, but the controlling truth of this whole project]** Todonado has **zero users and zero
validation that anyone wants it or will pay**. This — not any missing feature — is the dominant risk, and
**no amount of further building closes it.** The product is a bet that self-aware chronic over-committers
will (a) adopt a browser-only daily planner, (b) keep entering effort estimates, and (c) let a capacity
meter change their plan. None of those three has been observed in a single real human. The fake-door
intent tables (`upgrade_intents`, `feature_intents`) were built to measure demand but are insert-only with
no read-back **and** there's no analytics, so today the project cannot even *see* whether anyone expressed
interest. You are flying completely blind.

**What evidence would validate or kill the core bet (real users doing X, no invented numbers):**
- **Validate:** a cohort of real over-committers, instrumented, where a clear majority keep attaching
  `effort_minutes` unprompted past week 1, frequently accept the "move N to tomorrow" suggestion, and return
  on subsequent days — and say in their words that the meter changed a real decision.
- **Kill:** they skip the effort field (meter sits near 0 and degrades to a cosmetic bar), blow past the red
  meter without changing anything, and don't come back without a notification the product doesn't have. If
  that's the pattern, the wedge doesn't function and polish/pricing won't save it.

The cheapest possible test of this exists today and costs no new features beyond analytics.

---

## 5. What would RAISE THE PROJECT'S VALUE (ruthlessly prioritized)

> Reconciled with `SUPERAPP_ROADMAP.md`. Effort: `S` ≤1 day · `M` a few days · `L` 1–3 weeks. EV notes are
> qualitative — **no invented numbers**.

### Highest-leverage — deepen the actual wedge (effort-aware capacity)
*Every pick here feeds the capacity meter using data Todonado already owns. Build these only after
validation shows the wedge functions.*

1. **Estimate→actual bias in Insights** · `S–M` · **[FACT] data already exists** (`focus_sessions.actual_seconds`
   per task vs `effort_minutes`). Finish the flywheel: per-task estimate-vs-focused and one "you under/over-estimate
   by ~X%" figure. *Why it fits:* it's the compounding, sticky reason to estimate at all, and the most credible
   "it gets smarter as you use it" story. *EV: high, cheapest of the high-leverage set.*
2. **Statistical auto-effort-estimate (no-LLM)** · `M` · suggest an estimate from the user's own history
   (median `actual_seconds` + prior `effort_minutes`, same project) on add. *Why it fits:* the #1 reason planning
   fails is missing/garbage estimates; this removes the friction without an LLM or any text leaving the DB.
   *EV: high; directly de-risks the validation bet.*
3. **Deterministic auto-plan-my-day** · `M` · one Today button that packs unscheduled/rolled-over tasks to
   `scheduled_for = today` up to capacity, stopping at the overbooking line (greedy over existing selectors,
   unit-testable like roll-over, no AI). *Why it fits:* turns the meter from a passive warning into an active
   assistant — the best demo moment in the product. *EV: very high; pairs with #2.* Depends on decent estimates (#2).
4. **Adaptive capacity calibration** · `S` · nudge `daily_capacity_minutes` toward the rolling completed-vs-planned
   average. *Why it fits:* makes the single most important wedge parameter self-correcting instead of a guessed
   onboarding number. *EV: high per effort.*
5. **Calendar busy-import — ICS-first, then OAuth** · `M` (ICS) / `L` (Google OAuth) · subtract real meetings from
   the day's capacity. *Why it fits:* the most credible proof of "honest about capacity"; the meter stops assuming
   the whole day is task-available. *EV: highest credibility upgrade, but heaviest; ship the ICS slice first.*
   (CLAUDE.md sanctions read-only calendar; two-way sync stays out.)

### Monetization scaffolding (Stripe + real entitlements) · `L`
**[FACT]** none exists (fake-door only). **[HYPOTHESIS]** this raises value **only once there is demonstrated
demand** — it converts validated interest into revenue but adds nothing to an unvalidated product except
maintenance surface. **Do not build before §6's validation returns signal.** When built: entitlement column +
migration, server-enforced gating (RLS/Edge Function, not the current client check), Stripe checkout/portal/
webhooks, then tax/refund/proration (`D9`).

### Scope-creep TRAPS to explicitly avoid (generic-competitor features, no moat)
**[INFERENCE], aligned with `SUPERAPP_ROADMAP.md`:**
- **Intra-day time-blocking / calendar timeline** — turns Todonado into a Sunsama/Motion clone; the wedge is a
  daily *budget*, not a clock schedule.
- **Conversational AI agent / NL auto-planning** — high cost + recurring spend + full-corpus privacy exposure,
  collides with the no-AI identity, and walks into Motion's strength; the deterministic auto-plan (#3) gets most
  of the value with none of it.
- **Gamification (XP/badges/levels)** — generic engagement-bait, off-thesis ("recovery over guilt").
- **Distraction blocking** — a PWA literally can't enforce it; the buildable subset is placebo.
- **Public API + outbound webhooks** — platform mirage for a user base that doesn't exist.
- **Collaboration / shared workspaces** — biggest build for the least-validated demand; stay single-user (and stop
  implying "collaboration-ready") until single-user retention is proven. Use the `feature_intents` fake-door instead.
- **Native apps** before PWA-push even proves a return hook moves retention.
- **More generic wellness trackers** (hydration/journaling) — surface area that never feeds capacity.

---

## 6. The honest bottom line + sequenced next moves

**The highest-leverage next move is NOT building a feature.** It is making the project *legible* and putting it
in front of real people, because the dominant risk (§4B) is demand, and no feature closes it.

**Do first (in order):**
1. **Instrument it (`F1`, `S`) + fill `LEGAL_CONTACT` + add password reset (`D4`, `S`) + apply the F1 grant SQL.**
   Analytics is the literal first task — without it, onboarding users teaches you nothing. *(Easiest win:
   `LEGAL_CONTACT` + the grant SQL are minutes; analytics is ~a day.)*
2. **Run the validation, in parallel:** a fake-door landing with a price + "Start trial" (willingness-to-pay) **and**
   10–20 instrumented real over-committers for a week. Answer one question: *do they enter effort, and does the
   meter change a decision?*
3. **Only if validation is positive,** build the wedge-deepeners in §5 order: estimate→actual bias (`S–M`) →
   auto-estimate (`M`) → auto-plan-my-day (`M`) → adaptive calibration (`S`) → a real return hook (web-push, `L`),
   then the commercial layer (`D1`/`D2`).

**Ignore / waste of time right now:** Stripe and entitlements, collaboration/multi-workspace, native apps, any AI
agent, two-way calendar sync, and breadth-for-parity (labels/Kanban/Gantt). All are effort against an unvalidated
or off-thesis bet.

**Easiest win:** finish the estimate→actual bias metric in Insights — the data already exists, it's `S–M`, and it
upgrades the most defensible screen.
**Biggest upside (conditional on validation):** the self-improving wedge — auto-estimate + auto-plan + adaptive
capacity — which makes the differentiator get better every day it's used.
**Biggest waste (unconditional, until validation):** building the billing stack.

---

### Single highest-leverage next move
**Instrument the app (`F1` analytics + funnel) and put it in front of 10–20 real over-committers for a week to
answer one question — do they actually enter effort estimates, and does the capacity meter change a real decision?
— before building Stripe, the retention engine, or any new feature.**
