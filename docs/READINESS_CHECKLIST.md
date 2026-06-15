# Todonado — Distinctive & Production-Ready Build Checklist

> **Date:** 2026-06-15 · **Baseline:** `main` (audit at `538bb6d`) · **Companion:** `docs/PRODUCT_AUDIT.md`
>
> Goal: take Todonado from "well-built MVP" to a **distinctive, production-ready, sellable v1** — not another MVP. Every item cites real files/tables, a priority, a rough effort, a `distinctive`/`table-stakes` tag, and a crisp, **testable Done-when** line. Planning only — no app code here.
>
> **Legend** — Priority: `P0` blocks a credible paid launch · `P1` soon after · `P2` later. Effort: `S` ≤1 day · `M` a few days · `L` 1–3 weeks. Tag: **distinctive** raises the ceiling · **table-stakes** avoids looking unfinished. Items within each group are ordered **hardest-bottleneck-first**; IDs run in that order.
>
> *This checklist was adversarially critiqued against the live repo before publishing; reference-accuracy, completeness, prioritization, and acceptance-line testability were each pressure-tested and corrected.*

---

## 0. CRITICAL PATH — minimum ordered sequence to a distinctive, sellable v1

> Do these in order. Everything else parallelizes around them.

1. **Validate the wedge first (cheap, in parallel — see below). Ship F1 (analytics) + a *minimal* A1 (effort chips) so you test the real capture model, then DON'T build the heavy items (D1 Stripe, A3 Insights, A4 command center) until validation returns signal.**
2. **P0 safety net** — stop silent failure & data-loss: error surfacing + global `ErrorBoundary` (C1), confirm/undo on destructive actions (C2), `completeTask` transaction (E10), auth hardening (E11), password reset (D4).
3. **Make the differentiator real** — frictionless effort capture (A1) → meter never collapses to a false 0% (A2) → **Insights estimate→actual flywheel (A3)** → TodayPage becomes a real command center (A4).
4. **Retention engine** — daily planning ritual + web-push (B1), with the PWA shell (B2) shipped alongside → end-of-day review (B3) → streak/continuity (B4).
5. **Commercial layer** — decide free→paid line (D6) → entitlements + gating (D2) → Stripe billing (D1) → tax/refund/proration (D9) → settings + deletion (D3/D5) → email (D7/D10).
6. **Production + launch** — CI (E3), test-harness depth (E1), error tracking (E9), legal/compliance (E7), abuse/idempotency (E5), domain/trademark (F4), SEO/OG (F5), landing (F2), support (F6).

**Run in parallel BEFORE the heaviest builds (Stripe, Insights, command-center):** a **fake-door + behavioral validation** — a landing page with a price and a "Start trial" button (willingness-to-pay intent) **plus** 10–20 real over-committers on an instrumented build for a week, to answer the only question that matters: *do they actually enter `effort_minutes`, and does the capacity meter change a real scheduling decision?* If no, the wedge doesn't function and no billing/polish saves it — fix the capture model first. This requires **F1 (analytics) shipped first** — the literal first engineering task — plus a minimal A1.

---

## A. Make the differentiator REAL (distinctive — do first)

> Today the wedge is fragile: effort is a bare number box, missing effort silently reads as 0 (`capacity.ts:31-33`), Today is a flat list, and Insights is empty. Ordered bottleneck-first: the capture gate (A1) is the binding constraint on the whole wedge, then its correctness (A2), then the heavy distinctive payoff (A3, A4).

- [ ] **A1 — Frictionless effort capture** · `P0` · `M` · **distinctive**
  - **What:** The whole value depends on reliably-entered estimates, but `src/features/tasks/components/QuickAdd.tsx` offers only a raw numeric "min" box. Add one-tap quick-pick chips (15/30/45/60/90), a last-used/smart default, inline natural-language parse ("draft deck 45m tomorrow"), and a suggestion seeded from the task's own historical focus time. Apply in `TaskDialog.tsx` and debounce onboarding step-4 effort (`OnboardingOverlay.tsx:271-307` mutates on every keystroke).
  - **Done when:** QuickAdd + TaskDialog expose one-tap effort chips (15/30/45/60/90) that set `effort_minutes` without keyboard entry, and the onboarding step-4 effort handler is debounced ≥300ms (no per-keystroke mutation — asserted). *[Post-ship metric, read from F1, not a merge gate: ≥60% of tasks scheduled to a day carry non-null `effort_minutes` over a 7-day window with N active users.]*
- [ ] **A2 — Capacity meter must never silently collapse to a false 0%** · `P0` · `S` · **table-stakes**
  - **What:** `sumEffort` treats null as 0 (`src/features/today/capacity.ts:31-33`), so a fully-planned day of un-estimated tasks reads "0% planned / your day is clear." Distinguish "nothing scheduled" from "scheduled but un-estimated"; surface an "N tasks need an estimate" nudge in `CapacityMeter.tsx`; cap the high end (`effort_minutes` has no client upper bound; DB is int4).
  - **Done when:** scheduling un-estimated tasks renders an "N tasks need an estimate" indicator (never "0% / your day is clear" when tasks are scheduled), the meter shows estimated-vs-unestimated counts, and an effort value over a sane cap (e.g. >1440) is rejected with an inline message — not a raw Postgres int4 error.
- [ ] **A3 — Build Insights into the estimate→actual flywheel** · `P0` · `L` · **distinctive**
  - **What:** Replace the placeholder (`src/features/insights/InsightsPage.tsx` → `PagePlaceholder`) with a real screen comparing estimated `effort_minutes` to actual focused time (data exists: `focus_sessions.actual_seconds`, surfaced per-task in `TaskRow.tsx`). Show planned-vs-actual, a personal estimation-bias number, roll-over patterns, and focus trends. This is the compounding reason to estimate *and* to stay.
  - **Done when:** given a 7-day completed-task + `focus_session` fixture (extend `scripts/seed.mjs`): **[a]** `InsightsPage` renders a planned-vs-actual element with one row per completed task (estimate vs Σ `actual_seconds`); **[b]** a single labeled estimation-bias figure renders (e.g. median(actual/estimate)−1); **[c]** `/insights` no longer renders `PagePlaceholder` (no "Coming in MVP" badge), so the `nav.ts:17` item stops dead-ending.
- [ ] **A4 — Make TodayPage a real "command center," not a flat list** · `P0` · `L` · **distinctive**
  - **What:** `src/features/today/TodayPage.tsx` is header + meter + 2 banners + quick-add + flat checklist. Build the mission-control experience: a "now/next" focal task, lightweight intra-day structure (morning/afternoon buckets or optional time-blocks), and a clear day-state. Earn the "Your Command Center" title (`TodayPage.tsx:71`).
  - **Done when:** **[a]** the top of TodayPage renders a single "Now" card naming exactly one task (highest-priority `todo`/`in_progress` scheduled today; empty-state when none); **[b]** scheduled tasks render under ≥2 labeled intra-day groups, not one flat list; **[c]** a day-state badge shows one of clear/near/over/recovering derived from `CapacitySummary.status` + presence of overdue (unit-tested).

---

## B. Retention hooks (existential — a daily app with none dies)

> There are **zero** notifications/reminders/streaks anywhere in `src/`, and no service worker. Ordered: the notification/PWA infra (heaviest, the true bottleneck) first.

- [ ] **B1 — Daily planning ritual + web-push reminders** · `P0` · `L` · **distinctive**
  - **What:** No SW exists (`public/manifest.webmanifest` is dead weight without one). Add a service worker + web-push so a morning "plan your day" and an evening "wrap up" pull users back; pair with an in-app "Plan today" ritual (roll-over → estimate → commit). The engine the product structurally lacks.
  - **Done when:** **[a]** a registered service worker delivers a test web-push to an opted-in user; **[b]** scheduled morning-plan and end-of-day pushes fire at configured times and deep-link to `/` and the review flow; **[c]** the push-permission prompt appears only after a triggering event (first roll-over or first day-2 return), never on initial load (gated call-site, asserted).
- [ ] **B2 — PWA shell + offline-tolerant read cache** · `P1` · `M` · **table-stakes**
  - **What:** The manifest advertises an installable `standalone` app, but with no SW an installed PWA shows a blank/broken screen the instant the network blips. Precache the app shell and degrade reads gracefully (last-known data + offline banner, not an empty/error state). Distinct from B1's push transport.
  - **Done when:** an installed PWA opened offline shows the cached shell + last-known data with a clear offline indicator (not a white screen), and reconnecting re-syncs via the existing TanStack Query refetch.
- [ ] **B3 — End-of-day review / shutdown** · `P1` · `M` · **distinctive**
  - **What:** A short end-of-day flow: what got done, what to roll over (reuse `rollover.ts` + `RolloverBanner.tsx`), one-line reflection — the "recovery over guilt" beat, made a habit, feeding A3.
  - **Done when:** completing the flow (a) sets `scheduled_for = tomorrow` on every selected leftover (via `rollover.ts`) and (b) persists that day's per-task estimate-vs-actual rows consumed by A3 — both asserted by a test. *(Optional UX target: median completion <60s, measured in F1, not a merge gate.)*
- [ ] **B4 — Streak / continuity mechanic** · `P1` · `M` · **distinctive**
  - **What:** A non-shaming continuity signal that rewards *planning*, not 100% completion — consistent with the anti-guilt thesis; avoid the dark-pattern guilt loops the product rejects.
  - **Done when:** a server-persisted streak counter increments by 1 per consecutive calendar day the planning ritual is completed (≥1 task scheduled to today via the ritual); a missed day resets the *displayed* count to 0 with no negative/guilt copy and no push on reset (asserted); the count derives from ritual events, not completion %, (unit-tested deriving fn).
- [ ] **B5 — Email fallback nudges (lifecycle)** · `P1` · `S` · **table-stakes**
  - **What:** For users who don't grant push, a minimal email nudge ("you haven't planned in 3 days") via the D7/D10 provider.
  - **Done when:** a lapsing user receives at most one re-engagement email per defined window, with a working one-click unsubscribe.

---

## C. Core UX completeness & polish (table-stakes — stop looking unfinished)

> The audit flagged silent failures, missing confirms, and demo-ware. Ordered: cross-cutting trust/safety first, cosmetics last.

- [ ] **C1 — Surface fetch + mutation errors; add a global ErrorBoundary** · `P0` · `M` · **table-stakes**
  - **What:** Every `onError` in `useTaskMutations.ts` (and `useSubtasks`/`useProjects`/`useSections`/`useFocusSessions`) is a silent rollback; data pages gate only on `!isPending` so a failed fetch renders the *empty* state ("Your day is clear" on error). Add error toasts on mutation failure, per-page error+retry (consume `isError`), and a top-level `ErrorBoundary` (none exists — one bad render white-screens the SPA).
  - **Done when:** a failed mutation shows a toast and a failed fetch shows an error+retry (never the empty state — assert each branch), and an uncaught render error shows a recoverable boundary instead of a white screen.
- [ ] **C2 — Confirm + undo on every destructive action** · `P0` · `S` · **table-stakes**
  - **What:** Deleting a task **cascade-deletes all its subtasks** (`subtasks.task_id … ON DELETE CASCADE`, `initial_schema.sql:118`) on a single click via `TaskRow.tsx:186`; delete subtask (`src/features/tasks/components/SubtaskList.tsx:52-59`) too. *(Section/project delete is safer — `ON DELETE SET NULL`, `initial_schema.sql:93-94` — tasks survive as unsectioned/Inbox; the real irreversible loss is a task + its subtasks.)* Extend the existing roll-over toast/undo pattern.
  - **Done when:** deleting a task (which silently destroys its subtasks) or a subtask requires confirmation and/or offers undo; no single click irreversibly destroys a task + its subtasks.
- [ ] **C3 — Per-screen loading/empty/error state trio** · `P1` · `S` · **table-stakes**
  - **What:** Add loading skeletons (Today/Inbox/ProjectDetail/SubtaskList render nothing while `isPending` → pop-in) and ensure every list has the full state trio.
  - **Done when:** each of Today/Inbox/ProjectDetail/SubtaskList renders a skeleton while `isPending`, an error+retry while `isError`, and its designed empty state only when data loads empty (each branch asserted per screen).
- [ ] **C4 — Inbox triage (bulk + arbitrary-date scheduling)** · `P1` · `M` · **table-stakes**
  - **What:** Triage is impoverished — only a per-row "Schedule for today" icon (`TaskRow.tsx` offers schedule-today/unschedule only); rescheduling to any other date needs the full dialog. Add bulk-select, "schedule to tomorrow / pick a date" from the row, and filter/sort.
  - **Done when:** an Inbox row can schedule to an arbitrary date, and a multi-select bar schedules N selected tasks in one action — both without opening `TaskDialog`.
- [ ] **C5 — Resolve the search/⌘K facade** · `P1` · `M` · **distinctive**
  - **What:** `TopBar.tsx:45-51,87-104` ships permanently-disabled search inputs advertising a ⌘K palette with no keybinding. Build a real global search + command palette (recommended — fits the power-user ICP) or remove the fake affordance.
  - **Done when:** either Cmd-K/Ctrl-K opens a palette that filters across all tasks/projects and navigates via Enter, fully mouse-free — OR the disabled search input + ⌘K affordance are removed from `TopBar` (desktop + mobile modal). No disabled "coming soon" control ships.
- [ ] **C6 — Accessibility, mobile & motion** · `P1` · `S` · **table-stakes** *(target WCAG 2.1 AA)*
  - **What:** Add keyboard navigation to task lists (none today), a `prefers-reduced-motion` fallback (absent — `tailwind.config.js` fade-in, `CircularTimer.tsx` transition run unconditionally), confirm dnd-kit keyboard reorder, verify mobile sheets/safe-area.
  - **Done when:** **[a]** task lists are arrow-key navigable with Enter-to-open; **[b]** under `prefers-reduced-motion: reduce` the fade-in and `CircularTimer` transition are disabled; **[c]** dnd-kit reorder is keyboard-operable; **[d]** an axe-core scan of Today/Inbox/Focus reports zero serious/critical violations (wired into CI per E1/E3).
- [ ] **C7 — Remove stale dev artifacts & doc drift** · `P1` · `S` · **table-stakes**
  - **What:** Kill the always-visible `"Phase 0 · Foundation"` label (`Sidebar.tsx:58`); fix the self-contradictory Insights copy ("Coming in MVP" vs "arrive in V1"); update CLAUDE.md ("four primitives" vs eight in `ui/index.ts`); align `rounded-xl` controls vs documented `rounded-2xl`; de-duplicate `SWATCHES` (`ProjectsPage.tsx:11`) from the tokens.
  - **Done when:** all true — `Sidebar.tsx` shows no "Phase 0" string; `PagePlaceholder` shows no "Coming in MVP" badge on a V1 feature; CLAUDE.md primitive count matches `ui/index.ts`; control radius matches the documented standard; `SWATCHES` references the token source, not re-hardcoded hex.
- [ ] **C8 — i18n/locale decision + currency/date formatting** · `P2` · `S` · **table-stakes**
  - **What:** Hardcoded English throughout, no i18n lib, no locale-aware currency/date formatting (matters for displayed prices once D1 ships).
  - **Done when:** English-only-for-v1 is an explicit, recorded decision, but prices/dates/numbers render via locale-aware formatting (esp. billing amounts) and no concatenated-string patterns block future i18n.

---

## D. Commercial scaffolding (required to actually SELL)

> The data model and all 10 migrations contain **no billing/plan columns**; no settings page, no password reset, no account deletion, no export. Ordered: billing + gating (heaviest) first; the free→paid decision (D6) gates them and should be made before D1/D2 are built.

- [ ] **D1 — Stripe billing (subscriptions, checkout, portal, webhooks, dunning)** · `P0` · `L` · **table-stakes**
  - **What:** No payment integration anywhere. Add Stripe customers/subscriptions, hosted checkout, customer portal, webhook (Edge Function) syncing subscription state into the D2 entitlement column, and payment-failure dunning. (Tax/refund/proration/trial edge cases are D9; webhook idempotency is E5.)
  - **Done when:** a user can subscribe; the entitlement flips on `checkout.session.completed`/`customer.subscription.updated`; the portal allows manage/cancel; a failed payment moves to a defined grace state then downgrades — all verified end-to-end in Stripe test mode.
- [ ] **D2 — Plan tiers + feature gating / entitlements** · `P0` · `L` · **table-stakes**
  - **What:** No plan/entitlement column on `Profile`/`Workspace` (`src/types/database.ts`); only `DEFAULT_DAILY_CAPACITY_MINUTES`/`ENABLE_REALTIME` flags (`lib/config.ts`). Add an `entitlements`/`plan` column (+ migration) and a server-enforced gating primitive (not client-only). Gate per D6.
  - **Done when:** an `entitlements`/`plan` column exists on `profiles` (migration); for each capability in the D6 map, a free-plan JWT calling the gated endpoint/RPC is rejected **server-side** (RLS or Edge Function), proven by an automated test — not merely a hidden UI control.
- [ ] **D3 — Account / profile / settings management** · `P0` · `M` · **table-stakes**
  - **What:** No settings route (`AppRoutes.tsx`/`nav.ts`); the "Account" surface is just email + Log out (`TopBar.tsx:106-129`). `profiles.display_name`/`avatar_url` have no editor. Build a Settings page.
  - **Done when:** **[a]** `display_name`/`avatar_url` are editable + persisted; **[b]** email + password change via `supabase.auth.updateUser`, each verified end-to-end; **[c]** notification + capacity prefs are editable + persisted; **[d]** a Settings control opens the D1 Stripe customer portal.
- [ ] **D9 — Billing edge cases: tax/VAT, refunds, proration, trials** · `P1` · `M` · **table-stakes**
  - **What:** D1's happy path isn't chargeable in the EU without tax, and omits refunds/proration/trials. Enable Stripe Tax (VAT/sales tax + VAT-ID), define a refund/cancellation policy + self-serve cancel-with-grace, handle proration on plan change, and trial-start/trial-end/card-required mechanics tied to D2.
  - **Done when:** an EU customer is charged correct VAT on a compliant invoice; an upgrade/downgrade prorates correctly; a refund reverses the entitlement; trial→paid and trial-expiry each flip the entitlement and send the right email (ties D7/D10).
- [ ] **D7 — Transactional / lifecycle email** · `P1` · `M` · **table-stakes**
  - **What:** Only Supabase auth emails exist. Add a provider (Resend/Postmark) + templates for welcome, receipts (post-D1), trial-ending, dunning, and B5 nudges.
  - **Done when:** signup, payment receipt, and trial-ending each send a branded email reliably, with unsubscribe where applicable.
- [ ] **D8 — Data export + import (own-your-data / portability)** · `P1` · `M` · **table-stakes**
  - **What:** No export/import anywhere (audit §2.7). A trust + GDPR Art. 20 portability requirement, and a switching-cost lever (import from Todoist/Things).
  - **Done when:** a user can export their full data (tasks/projects/sections/subtasks/focus-sessions) from Settings as a downloadable JSON/CSV and re-import it into a clean account losslessly; GDPR Art. 20 is satisfiable without manual DB access.
- [ ] **D4 — Password reset / forgot-password flow** · `P0` · `S` · **table-stakes**
  - **What:** `LoginPage.tsx` offers signin/signup/magic-link only — a forgotten password = permanent lockout. Add `resetPasswordForEmail` + a reset-handler route + in-app `updateUser` password change (ties D3).
  - **Done when:** a user can request a reset email and set a new password end-to-end, and change their password while logged in.
- [ ] **D5 — Self-serve account deletion (GDPR/CCPA)** · `P0` · `S` · **table-stakes**
  - **What:** No delete-account path; legally required for paid EU/CA users. Add a confirmed delete that removes the auth user (cascades clean via FK `on delete cascade`).
  - **Done when:** a user can permanently delete their account + data from Settings with explicit confirmation, and the deletion is verifiably complete (no orphaned rows).
- [ ] **D6 — Decide & implement the free→paid line** · `P0` · `S` · **distinctive**
  - **What:** A pricing/packaging decision (cheap, but gates D1/D2 — decide it first). Hypothesis (from the audit): **Free** = unlimited capture/Inbox/projects + a single-day capacity meter (everyone feels the aha once). **Paid (~$6/mo annual)** = the habit layer: full effort estimating + the overbooking auto-suggester + roll-over history + Focus sessions + recurring tasks + **Insights**. Validate via F2 before committing.
  - **Done when:** the tier boundary is written down, encoded in the D2 entitlement map, and validated by the F2 price test — not a guess.
- [ ] **D10 — Email deliverability + consent + onboarding drip** · `P1` · `S` · **table-stakes**
  - **What:** Mail lands in spam without domain auth, and marketing mail needs consent. Configure SPF/DKIM/DMARC for the sending domain; separate transactional vs marketing with double-opt-in + a preference center/global unsubscribe; design a 3–4 step activation drip (welcome → first-estimate nudge → aha recap → trial-ending).
  - **Done when:** domain auth passes (mail inboxes reliably), marketing mail has consent + one-click unsubscribe, and a new user receives a tuned activation sequence instrumented against the F1 funnel.
- [ ] **D11 — Insights-led upgrade moment** · `P1` · `S` · **distinctive**
  - **What:** Don't ship a blank paywall — use the one distinctive asset as the conversion driver. Tease the estimation-bias/planned-vs-actual insight (A3) to free/trial users as the explicit upgrade trigger.
  - **Done when:** a free/trial user sees a concrete, personalized "you underestimate by ~X%" teaser driving the upgrade CTA, and conversion from that surface is measured in F1.

---

## E. Production-readiness & hardening

> Ordered: heaviest infra/correctness first; cheap-but-critical fixes and later items after.

- [ ] **E1 — Test-harness depth (component/hook/integration + broaden RLS + purchase smoke)** · `P0` · `L` · **table-stakes**
  - **What:** The repo has only pure-logic vitest + **one** pgTAP test (`supabase/tests/tasks_workspace_integrity.test.sql`, which covers *only* the task↔workspace co-location write guard, two users, via `supabase test db`). No component/hook/integration/e2e tests; `package.json` has no `@testing-library`/jsdom/Playwright. Add the missing layers, especially before taking money.
  - **Done when:** CI runs and blocks on: **(1)** hook/component tests via `@testing-library`+jsdom (start: `useTaskMutations` optimistic/rollback, `useRealtimeSync`); **(2)** a Playwright smoke of signup→onboarding→plan→checkout; **(3)** the recurrence spawn-once against a real local Postgres; **(4)** a broadened pgTAP suite proving user A cannot SELECT/UPDATE user B's rows across `tasks`/`subtasks`/`focus_sessions` (extends the existing single-guard test).
- [ ] **E2 — Server-side query windowing (remove the scale cliff)** · `P1` · `L` · **table-stakes**
  - **What:** `useTasks` fetches the *entire* task table unbounded incl. all completed history (`useTasks.ts:15-24`); `useFocusSessions` fetches all sessions and is mounted on every task-list screen (Today/Inbox/Projects) via `TaskListView.tsx:47`. Move to date/status-scoped queries (indexes already exist) and archive old completed tasks. Note: the one-cache + pure-selectors design means this touches every selector and optimistic path.
  - **Done when:** Today/Inbox/Projects query only the rows they need (windowed by date/status), cold-load payload stays roughly flat as lifetime task count grows, and selectors/optimistic updates still pass tests.
- [ ] **E3 — CI pipeline + generated DB types + migration discipline** · `P0` · `M` · **table-stakes**
  - **What:** No `.github/`, no CI; scripts run only manually. Hand-written `src/types/database.ts` can drift from migrations. Add CI (lint+typecheck+test+build, plus the E1 layers + axe scan, on PR), generate types (`supabase gen types`), and a documented migration/PR gate.
  - **Done when:** every PR runs lint+typecheck+test+build (+ E1 suites) and blocks on failure; DB types are generated, not hand-maintained; a migration can't merge without CI green.
- [ ] **E4 — Realtime precision + cross-account cache safety** · `P1` · `M` · **table-stakes**
  - **What:** `sections`/`subtasks` realtime listeners are unfiltered (table-wide fan-out, `useRealtimeSync.ts:46-47`); whole-cache invalidation makes `rollAll`/`moveToTomorrow` trigger N full refetches (`TodayPage.tsx:54-65`). `qk.workspace`/`qk.profile` are global and the cache isn't cleared on auth change (`AuthProvider.tsx`) → cross-account bleed.
  - **Done when:** a section/subtask edit in another tenant doesn't wake unrelated clients, a roll-over of N tasks triggers ≤1 refetch, and switching accounts in one tab never shows the prior user's data.
- [ ] **E5 — Abuse prevention, rate limiting + Stripe webhook idempotency** · `P1` · `M` · **table-stakes**
  - **What:** Only Supabase's per-IP auth limit exists; no app-layer write rate-limiting, no captcha on signup (`[auth.captcha]` disabled in `config.toml`), and D1's webhook needs replay protection (a replayed `checkout.session.completed` could double-provision).
  - **Done when:** a single account can't exceed a sane write rate, the Stripe webhook verifies signatures + uses idempotency keys so replays are no-ops, and automated signup/abuse is throttled (captcha/turnstile).
- [ ] **E6 — Multi-tenancy decision + RLS co-location guards + off-prod default** · `P1` · `M` · **distinctive/table-stakes**
  - **What:** Either commit to single-user (and stop calling it "collaboration-ready") or wire shared workspaces. Independently of that, close the latent guards before any second user can join: `focus_sessions` task↔workspace co-location (`SEC-1`), `workspace_members.role` integrity (`SEC-2`), and move the committed anon/project-ref default off production (`env.ts:18-20`).
  - **Done when:** **[a]** a single-user-vs-collaboration decision is recorded in `CLAUDE.md`/docs with a dated line; **[b]** the `env.ts` default no longer points at project ref `lplsbfduankkpglyusjp` (committed default differs); **[c]** the SEC-1 and SEC-2 guards are added with tests — independent of whether collaboration ships.
- [ ] **E7 — Legal & compliance depth** · `P0` · `M` · **table-stakes**
  - **What:** No Privacy/ToS/cookie/DPA anywhere; Stripe and stores require them before charging, and EU data via Supabase/Stripe/email/analytics requires a DPA + subprocessor list + consent.
  - **Done when:** Privacy Policy + Terms are published and linked (login/footer/Settings); a DPA + subprocessor list is available to EU buyers; a consent banner gates non-essential analytics cookies (which **will** ship per F1); a refund/cancellation policy is published and linked from checkout.
- [ ] **E8 — Minimal admin / operator console** · `P2` · `M` · **table-stakes**
  - **What:** No operator tooling (audit §2.7). Once you charge, support requires looking up a user, inspecting/overriding entitlement, resending receipts, refunding — without raw prod SQL.
  - **Done when:** an operator can resolve the common support actions (find user, fix entitlement, refund, resend email, safe soft-delete) from a controlled surface with an audit trail.
- [ ] **E9 — Error tracking + observability** · `P0` · `S` · **table-stakes**
  - **What:** No Sentry/Datadog, no `captureException`. After taking payment, the first prod bug is invisible. Add Sentry (client + Edge Functions) wired to the C1 `ErrorBoundary` + alerting.
  - **Done when:** an unhandled client/server error appears in Sentry with stack + user/session context (verified via a thrown test error wired to the C1 boundary), and an alert is delivered to a defined channel when error rate crosses a pre-set threshold.
- [ ] **E10 — Make `completeTask` atomic** · `P0` · `S` · **table-stakes**
  - **What:** The done-`UPDATE` and recurrence-`INSERT` are two non-transactional statements (`src/features/tasks/api/completeTask.ts:40-64`). If the UPDATE wins the CAS but the INSERT fails, the task is `done`, no next occurrence is created, and a retry's CAS returns null → the recurrence is permanently lost. Wrap in a Postgres RPC/transaction.
  - **Done when:** completing a recurring task either fully completes-and-spawns or fully rolls back; an injected INSERT failure leaves the task not-done and re-tryable (covered by a test).
- [ ] **E11 — Auth hardening** · `P0` · `S` · **table-stakes**
  - **What:** `supabase/config.toml`: `minimum_password_length = 6`, empty `password_requirements`, captcha disabled, MFA disabled, `enable_confirmations=false` (session issued without email verification). Raise min length ≥8 + complexity, enable captcha + email confirmation, return a generic auth error in `LoginPage.tsx:49`.
  - **Done when:** weak passwords are rejected, captcha + email confirmation are on, the UI never leaks account-existence via verbatim errors, and a basic spray test is throttled.
- [ ] **E12 — Focus-timer clock-skew guard** · `P1` · `S` · **table-stakes**
  - **What:** `timer.ts:16-20,37-45` derives elapsed purely from `Date.now()`; a backward wall-clock step rewinds/freezes the timer and mis-records `actual_seconds`/paused time (confirmed bug, narrow trigger). Guard against backward jumps and add a test.
  - **Done when:** a simulated backward clock step mid-session does not rewind the displayed timer or corrupt persisted `actual_seconds`, and a regression test covers it.
- [ ] **E13 — Backups / DR runbook** · `P2` · `S` · **table-stakes**
  - **What:** No documented backup/PITR/restore. Confirm Supabase tier PITR; document a restore runbook.
  - **Done when:** PITR is enabled and a restore has been test-run and documented.

---

## F. Pre-launch operational

> Ordered: instrumentation first (it gates validation), then the validation/launch surfaces.

- [ ] **F1 — Analytics + activation/retention funnel instrumentation** · `P0` · `S` · **table-stakes**
  - **What:** Zero telemetry today (no PostHog/Mixpanel/GA). Add product analytics and instrument the funnel: signup → onboarding-complete → first-estimate-entered → meter-crossed-capacity → suggestion-accepted → day-2/3/7 return. **This is the first engineering task** — it unblocks critical-path validation. (Consent gating per E7.)
  - **Done when:** the full activation→retention funnel is visible in a dashboard and day-1/3/7 retention can be read per cohort.
- [ ] **F2 — Landing page + fake-door price/validation test** · `P0` · `M` · **distinctive**
  - **What:** A landing page selling the *one* distinctive promise (the honest, calm "realistic day" + estimation flywheel — not "another to-do list"), with a price and a "Start trial" CTA used as the willingness-to-pay fake-door (runs BEFORE D1/A3/A4 per the critical path).
  - **Done when:** the page is live with a stated price + "Start trial" CTA wired to an F1 event; after a pre-registered N unique visitors, the click-through-to-trial rate is recorded against a pre-set threshold X, and the proceed/pivot decision is written down (N and X fixed before launch).
- [ ] **F3 — Onboarding → activation tuning** · `P1` · `M` · **distinctive**
  - **What:** Onboarding (`OnboardingOverlay.tsx`) is strong but can dead-end at a 0%-planned meter when effort is skipped (step-4 effort is optional). Require ≥1 estimate so the "meter fills = aha" lands; instrument the drop step via F1.
  - **Done when:** **[a]** onboarding cannot complete without ≥1 task carrying non-null `effort_minutes` (gated), so the final meter is always non-empty; **[b]** the step-4 drop-off rate is captured as a baseline in F1, and a tuning change is accepted only if it cuts that drop-off by ≥X points.
- [ ] **F4 — Domain + trademark/name clearance** · `P0` · `S` · **table-stakes**
  - **What:** Confirm "Todonado" is clear (trademark search, domain, app-store name collisions) before investing in brand/landing — de-risks a forced post-launch rename.
  - **Done when:** name clearance is documented, the domain is secured, and no blocking trademark conflict is found.
- [ ] **F5 — SEO, OpenGraph & social-share metadata** · `P1` · `S` · **table-stakes**
  - **What:** `index.html` has a `description` but **no** OpenGraph/Twitter-card/canonical tags, and there's no `robots.txt`/`sitemap.xml` — so the F2 landing produces a blank unfurl on Slack/X/LinkedIn and is invisible to crawlers, leaking the top of the F1 funnel.
  - **Done when:** OG + Twitter-card tags (title/description/image), a canonical URL, `robots.txt` + `sitemap.xml`, and per-route titles exist; sharing the landing URL renders a branded card and Lighthouse SEO passes.
- [ ] **F6 — Support, feedback & changelog surface** · `P1` · `S` · **table-stakes**
  - **What:** No contact/help/feedback/changelog anywhere (audit §2.7) — "a paid user with a problem has nowhere to go."
  - **Done when:** a stuck paid user can reach support in ≤2 clicks (Settings + login footer), in-app feedback lands somewhere monitored, and shipped changes are visible on a changelog/release-notes page.
- [ ] **F7 — Uptime monitoring + public status page + stated SLA** · `P2` · `S` · **table-stakes**
  - **What:** No uptime/synthetic monitoring (E9 is error-tracking, not uptime), no status page, no stated support/availability commitment.
  - **Done when:** an outage pages the operator within minutes, users can self-check a public status page, and the support/availability commitment is published.

---

## Highest-leverage item to start with

**Ship F1 (analytics + funnel) and a *minimal* A1 (one-tap effort chips) immediately, then run the critical-path validation (F2 fake-door + 10–20 instrumented users) to answer one question before building Stripe, Insights, or the command center: do real over-committers enter effort estimates, and does the meter change a decision?** If yes, build A1→A2→A3→A4 and B1 with confidence. If no, fix the capture model first — everything in groups D and E is wasted effort on a wedge that doesn't function.
