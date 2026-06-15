# Todonado — Product & Engineering Audit + Target Blueprint

> **Date:** 2026-06-15 · **Scope:** whole repo at commit `538bb6d` (`main`). Review & planning only — no app code changed.
>
> **Method:** Every claim below was grounded by reading the actual source (CLAUDE.md, `docs/`, all 10 `supabase/migrations/`, and the `src/` tree). Findings were produced by a fan-out of dimension auditors, then every medium-or-higher security/correctness finding was put through an adversarial "try to refute it" pass (two independent skeptics each) and re-read by hand. Where the adversarial pass corrected a claim, the corrected verdict is the one recorded here.
>
> **Honesty legend** — every non-trivial claim is tagged:
> - **[FACT]** verifiable in the code today (file/line/table/policy cited).
> - **[INFERENCE]** reasoned from the code, not directly stated.
> - **[HYPOTHESIS]** about users / market / demand / pricing. **There is zero real user data in this repo** — treat all of these as unvalidated guesses that need real users to confirm or kill.

---

## 1. Executive verdict

**[FACT + INFERENCE]** Todonado is a *competently engineered, visually premium, single-user web to-do list with one genuinely-thoughtful feature bolted on* — an effort-aware daily capacity meter (`src/features/today/capacity.ts` + `CapacityMeter.tsx`) plus a calm one-tap roll-over (`rollover.ts`) and a "move the fewest, lowest-priority tasks to tomorrow" suggester (`capacity.ts:68-95`). The craft is real: strict TypeScript, RLS on every table, pure unit-tested domain logic, an atomic compare-and-swap completion, and a locked, well-obeyed design system. But the product is **not** the "mission-control command center" the copy claims — `TodayPage.tsx` is a flat scheduled-task list with a meter and two banners; there is no time-blocking, no calendar, no notion of "now," and no execution surface beyond a checkbox. **The single biggest risk to it succeeding as paid SaaS is that the entire value proposition depends on a high-friction user behavior the product does almost nothing to support or reward — manually typing `effort_minutes` on every task — with no estimate-vs-actual feedback loop (Insights is a placeholder) and no retention hook (zero notifications/reminders/streaks anywhere in the code).** If users skip the effort field, `sumEffort` treats null as 0 (`capacity.ts:31-33`) and the differentiator silently collapses to a worse, web-only Todoist. **Honest call:** the *codebase* is worth continuing — it's a strong foundation. The *current product direction is not yet worth charging for and has no moat*; the wedge is ~95 lines of arithmetic any incumbent could ship in a week. Continue, but only if you commit to (a) making effort estimation low-friction, (b) building the estimate→actual feedback flywheel (Insights), and (c) adding a real return hook — and you accept this is a narrow "calm, cheap, manual, no-AI anti-Sunsama" niche, not a category-definer. As-is, it's a beautiful demo, not a business.

---

## 2. Current-state audit

### 2.1 Core product & value

**What's built [FACT]:** Effort-aware capacity meter (`capacity.ts`, `CapacityMeter.tsx`), overbooking guard with minimal-deferral suggestions (`capacity.ts:68-95`, `components/OverbookingWarning.tsx`), one-tap roll-over with undo (`rollover.ts`, `components/RolloverBanner.tsx`, `TodayPage.tsx:50-65`), fast capture (`QuickAdd.tsx`, `InboxPage.tsx`), and a 4-step first-run onboarding (`OnboardingOverlay.tsx`, `onboarding/gating.ts`).

**Strong:**
- **[FACT]** `computeCapacity` is clean and correct: empty/ok/near/over states, `NEAR_THRESHOLD` 0.8, clamped `freeMinutes`/`overMinutes`, uncapped `pct` vs clamped `barPct` (`capacity.ts:36-59`).
- **[FACT]** `suggestTasksToMoveTomorrow` is the most differentiated logic in the app: sort by priority then larger-effort-first, greedily stop the moment you're back under capacity → the *minimal* deferral set (`capacity.ts:68-95`).
- **[FACT]** The meter counts only remaining (todo/in_progress) effort, so a finished day reads "clear," not "overbooked" (`TodayPage.tsx:44-47`) — a deliberately correct product call that avoids a classic capacity-meter footgun.
- **[FACT]** Onboarding actually schedules the just-captured tasks to today (`OnboardingOverlay.tsx:107-115`) so the meter visibly fills as the engineered "aha," and is properly gated by `profiles.onboarding_completed`, never re-shown.

**Weak / half-baked:**
- **[FACT] (high)** The differentiator depends on a behavior the product barely supports. `QuickAdd.tsx` exposes a bare numeric "min" box — no quick-pick chips (15/30/60), no last-used default, no natural-language parse ("call Bob 30m"). The one field the whole wedge needs is the least supported, and missing effort silently reads as 0 (`capacity.ts:31-33`).
- **[FACT] (high)** No estimate-vs-actual feedback anywhere. Focus sessions record real time and `TaskRow.tsx` even renders focused minutes, but the app never compares estimate to actual. There is zero reinforcement that estimating pays off, so the habit has no flywheel. Insights is a placeholder (`InsightsPage.tsx`).
- **[FACT] (high)** The retention/habit loop has no product hook: no reminders, notifications, streaks, daily digest, or end-of-day reflection (grep finds none in `src/`). The roll-over banner only fires *after* the user already returned — it can clean up a missed day, it cannot drive the return.
- **[FACT/INFERENCE] (medium)** "Command center" is positioning, not UX. `scheduled_for` is date-only (`lib/date.ts`), so capacity is a single daily bucket that answers "does it fit in the day?" but never "when?" — which is what over-committers actually struggle with.
- **[FACT] (medium)** Capacity ignores the calendar. A user with 6h capacity and 4h of meetings still sees 6h of headroom; calendar busy-import is deferred to V1, so the "honest day" promise is undermined for anyone who lives in a calendar.

**Risks:**
- **[HYPOTHESIS] (high)** Manual per-task estimation is high-friction/low-reward; users likely abandon it within days without auto-suggest or visible payoff. If they stop, the meter degrades to a cosmetic progress bar.
- **[HYPOTHESIS] (high)** With no return hook, a "daily" command center relies entirely on the user's pre-existing habit — an existential adoption risk.

### 2.2 UX & flows

**What's built [FACT]:** Login (password + magic link + signup, `LoginPage.tsx`), onboarding overlay, responsive shell (sidebar + 5-tab `BottomNav` + `TopBar` + `AddTaskFab`), Today, Inbox, Projects + ProjectDetail (sections, subtasks, drag-reorder), Focus mode (setup→running→summary), full task edit dialog with recurrence + Zod validation (`TaskDialog.tsx`), toast stack (`ToastProvider.tsx`).

**Strong:**
- **[FACT]** The capture → plan → execute loop is fully real and instant (optimistic mutations): `QuickAdd` → `selectToday` → `updateTask` → live `CapacityMeter`. The differentiator is not vaporware.
- **[FACT]** Empty states are thoughtful and on-brand ("Your day is clear.", "Inbox zero.", "No projects yet.") — `TodayPage.tsx:137`, `InboxPage.tsx`, `ProjectsPage.tsx`.
- **[FACT]** `WorkspaceProvider.tsx:54-73` is the one place error handling is done right — a real error screen with a migrations hint and a working "Try again."

**Weak / half-baked:**
- **[FACT] (high)** **No per-page error state on any data page.** Today/Inbox/Projects/ProjectDetail/Focus gate only on `!isPending` (`TodayPage.tsx:124`, `InboxPage.tsx:44`); `useTasks` exposes `isError` but no consumer reads it. **A failed fetch renders the *empty* state — actively telling the user "Your day is clear" / "Inbox zero" when the data just failed to load.**
- **[FACT] (high)** **All mutation failures are silent.** Every `onError` in `useTaskMutations.ts` (lines 65, 86, 112, 127, 147) is a bare `rollback(ctx)` with no toast — same in `useSubtasks`/`useProjects`/`useSections`/`useFocusSessions`. On a flaky network the user's change just vanishes with no explanation — reads as data loss.
- **[FACT] (high)** **Destructive actions have no confirm and no undo.** Delete task (`TaskRow.tsx:186`) — which **cascade-deletes all of its subtasks** (`subtasks.task_id … ON DELETE CASCADE`, `initial_schema.sql:118`) — and delete subtask (`src/features/tasks/components/SubtaskList.tsx:52-59`) both fire on a single click. No `window.confirm` exists anywhere; undo exists only for roll-over. **Correction:** deleting a *section* or *project* is **not** a cascade — `section_id`/`project_id` are `ON DELETE SET NULL` (`initial_schema.sql:93-94`), so their tasks survive as unsectioned/in the Inbox, not destroyed. The genuine irreversible one-click loss is a task (with its subtasks), via `SectionGroup.tsx:79-88` and the row/subtask delete controls.
- **[FACT] (medium)** **No global `ErrorBoundary`** (grep returns zero). One uncaught render error (e.g. a malformed realtime payload) white-screens the entire SPA with no recovery.
- **[FACT] (medium)** **Search is a permanent facade** — disabled inputs in both `TopBar.tsx:45-51` and the mobile modal (`:87-104`), advertising a ⌘K palette that has no keybinding. **Insights is a primary-nav dead-end** whose own copy contradicts itself ("Coming in MVP" badge vs "arrive in V1" hint).
- **[FACT] (medium)** Inbox triage is impoverished: only a per-row "Schedule for today" icon — no bulk select, no "schedule to tomorrow/pick a date" from the row (that requires opening the full dialog), no filter/sort.
- **[FACT] (low)** Stale dev artifact shipped in the always-visible sidebar account block: `"Phase 0 · Foundation"` (`Sidebar.tsx:58`). No loading skeletons; content pops in. No keyboard nav of task lists.

**Risks:** **[HYPOTHESIS] (high)** silent fetch/mutation failure + empty-state-on-error is the fastest way to destroy trust in a task app. **[FACT→risk] (high)** one-click delete of a task silently cascade-deletes all its subtasks (`initial_schema.sql:118`) with no confirm/undo — unrecoverable on a misclick.

### 2.3 Visual design & design system

**What's built [FACT]:** Locked token system (`tailwind.config.js`, `src/index.css`), 8 UI primitives (`components/ui/`), brandmark (`Logo.tsx`), responsive shell, designed empty states, the flagship `CapacityMeter` UI, a calm SVG `CircularTimer`.

**Strong (this is the best-executed area):**
- **[FACT]** **Token discipline is genuinely enforced**, not just documented: grep for `bg-[#…]`/`text-[#…]`/`border-[#…]`/`ring-[#…]` across `src/` returns **zero** matches. The only raw hex is in two defensible places — the `CircularTimer.tsx` SVG gradient (where Tailwind utilities can't apply) and dynamic user-chosen project colors.
- **[FACT]** Real accessibility: `Modal.tsx` has a focus trap + scroll lock + focus restoration; `CapacityMeter` uses `role="progressbar"` with full aria-values; every icon-only button is labelled; `TaskRow` solves the touch-vs-hover affordance (`opacity-100` default, `md:group-hover` reveal).
- **[FACT]** Mobile is real, not bolted on: `BottomNav` + `AddTaskFab` + `env(safe-area-inset-bottom)` padding in `AppShell`.

**Weak (all minor/cosmetic):**
- **[FACT] (medium)** Stale `"Phase 0 · Foundation"` string in the sidebar (`Sidebar.tsx:58`) — reads as a forgotten dev artifact in prominent UI. Disabled Search bar + placeholder Insights are visible in the shipped shell and read as "demo-ware" to a first-time user.
- **[FACT] (low)** Documented `rounded-2xl` "card radius standard" is not enforced on controls — Button/Input/Select/Textarea use the off-token `rounded-xl` (`Button.tsx:9` vs `tailwind.config.js:38`). `SWATCHES` re-hardcodes the token hex (`ProjectsPage.tsx:11`), a second source of truth that can drift. No `prefers-reduced-motion` fallback anywhere. CLAUDE.md says "four primitives"; the barrel exports eight (`ui/index.ts`) — doc drift on a "LOCKED" contract.

**Verdict [INFERENCE]:** premium, disciplined, single-developer work. Nothing here reads as unfinished except the explicitly-placeholdered Insights and the fake Search.

### 2.4 Architecture & code quality (and what breaks at scale)

**What's built [FACT]:** Single shared Supabase client (`lib/supabase.ts`) + query client + central key registry (`lib/queryKeys.ts`), feature-based folders, pure selectors deriving every view from one task cache, optimistic mutations (`useTaskMutations.ts`), realtime sync (`useRealtimeSync.ts`), fractional-position reorder (`lib/reorder.ts` + migration), a sound RLS-first schema (10 migrations).

**Strong:**
- **[FACT]** Pure, I/O-free, unit-tested domain logic (`capacity`, `rollover`, `recurrence`, `reorder`, `selectors`); every view is a pure function of one cache, which makes optimistic updates trivially correct.
- **[FACT]** `completeTask.ts:40-58` uses an atomic `UPDATE … .neq('status','done').maybeSingle()` compare-and-swap so only the race-winner spawns the next recurrence — genuinely correct concurrency design.
- **[FACT]** Fractional positions (`double precision`) make every reorder a single-row update — no reindex storms (`reorder.ts`, `fractional_positions.sql`).
- **[FACT]** RLS is layered and real: SECURITY DEFINER helpers avoid recursion; `task_workspace_integrity.sql` closes a concrete cross-workspace write hole.

**Weak / scale cliffs (the core concern):**
- **[FACT] (high)** **`useTasks` fetches the entire task table for the workspace** — `select('*')` with no `.range`/`.limit`/date/status filter (`useTasks.ts:15-24`), *including every done/cancelled task forever*. All of Today/Inbox/Projects filter this in the browser. This is per-user **unbounded growth**: a user with thousands of historical/recurring tasks re-downloads and re-parses the whole set on every cold load and every invalidation. The schema *has* the indexes (`scheduled_for`, `status`) — the client never uses them.
- **[FACT] (high)** **`useFocusSessions` also fetches ALL sessions, unbounded, and is mounted on every primary screen** via `TaskListView.tsx:47-48` just to render per-task focused-time badges. Every Today/Inbox/Project render pulls the full, ever-growing session history.
- **[FACT] (high)** **Realtime invalidation is whole-cache and coarse.** Every tasks change invalidates the full `qk.tasks(workspaceId)` key → full re-download. Worse, `rollAll`/`moveToTomorrow`/`undoRoll` fire **one mutation per task** in a loop (`TodayPage.tsx:54-65`), each `onSettled` invalidating the entire list — so rolling N overdue tasks can refetch the whole task set N times. No batching.
- **[FACT] (high)** **`sections`/`subtasks` realtime listeners are unfiltered** (those tables have no `workspace_id`) — they subscribe table-wide and invalidate the `['sections']`/`['subtasks']` family on *any* tenant's edit (`useRealtimeSync.ts:46-47`). RLS still gates payload *content* (no data leak), but at multi-tenant scale every client is woken by every other tenant's activity — a realtime-quota and read-load multiplier.
- **[FACT] (medium)** **Single-workspace is hard-coded end-to-end**, contradicting the "collaboration-ready" framing: `handle_new_user` provisions exactly one workspace, `WorkspaceProvider` picks the *oldest* via `.limit(1)` and ignores the rest, and the query keys take a single `workspaceId`. Only the *table shape* of `workspace_members` is collab-ready; nothing is wired.
- **[FACT] (medium)** `qk.workspace`/`qk.profile` are global (not user-scoped) and `AuthProvider` never clears the cache on auth change → **cross-account cache bleed**: a previous user's workspace/profile can be served after an account switch in the same tab.
- **[FACT] (low)** Hand-written DB types explicitly not generated from schema (`types/database.ts:1-7`) → silent drift risk. `useUpdateCapacity` does an extra `auth.getUser()` round-trip on every save. Fractional positions are never renormalized (midpoint forever eventually exhausts float precision).

**Risk [INFERENCE] (medium):** the architecture's elegance (one cache + pure selectors) is *exactly* what blocks scaling — adding pagination/date-windowing later means rewriting every selector and optimistic path.

### 2.5 Logic & correctness (+ test reality)

**Verdict [FACT]:** The pure-logic core is genuinely well-built and the scary cases are real, correct, **and tested**. Two hypotheses were checked by actually running date-fns and **disproven**: `parseISO('yyyy-MM-dd')` returns **local** midnight and all recurrence math stays in calendar fields, so **DST and timezone offset do not corrupt the date round-trip**. `timezone.test.ts` pins `TZ` to two offsets and asserts local-day classification across the UTC-midnight boundary — a standout regression test. The biweekly-phase, month-end-clamp, leap-year, and overdue-recovery recurrence cases are correct and tested (`recurrence.test.ts`).

**Real, unmitigated issues:**
- **[FACT] (low–medium, adversarially confirmed)** **Focus timer trusts `Date.now()` with no clock-skew guard** (`timer.ts:16-20`, `:37-45`). A backward wall-clock step (NTP correction, manual change, long sleep) makes the displayed timer rewind/freeze, and `resume()` folds a real pause as 0 paused seconds — so the persisted `actual_seconds` is wrong. No test rewinds the clock. *Both skeptics confirmed the mechanics; one rated it low (narrow trigger, single-user, local, only downstream consumer is the unbuilt Insights). Net: real, narrow, untested.*
- **[FACT] (low)** **`buildNextOccurrence` copies `position` verbatim** (`recurrence.ts:130`), so every spawned recurrence collides on `position` with its still-present `done` parent. There's no UNIQUE constraint, so it inserts fine; `created_at` tiebreak masks it today — latent ordering bug, untested (`recurrence.test.ts` checks every copied field *except* position).
- **[FACT] (low)** **No upper bound on `effort_minutes`** client-side; DB column is `int4` (`initial_schema.sql:100` only checks `>= 0`). A huge value overflows Postgres with a raw error, and `pct` can be astronomically large (only `barPct` is clamped).
- **[INFERENCE] (low — found in manual review, beyond the agent set)** **`completeTask` is not transactional:** the done-`UPDATE` and the recurrence-`INSERT` are two separate statements (`completeTask.ts:40-64`). If the UPDATE wins the CAS but the INSERT fails (transient network/RLS error), the task is `done`, **no next occurrence is created, and a retry's CAS returns null → the recurrence is permanently lost** for that completion. Should be one RPC/transaction.
- **[FACT] (low)** `isComplete` (reached planned minutes) and `endStatusFor` (60s "abandoned" threshold) can contradict for sub-60s planned sessions; reconciliation lives in untested `SummaryView.tsx`.

**Correctly handled — do *not* mis-read as a bug [FACT, adversarially deflated]:** the recurrence **"spawn exactly once"** guarantee. The atomic CAS is the right pattern, and realtime invalidation is a *read-only* refetch that never re-runs `completeTask`. Both skeptics downgraded the original "atomicity" finding to **low** — the only real gap is that the guarantee is unit-tested against an in-memory fake (`completeTask.test.ts` `FakeQuery`), not a real Postgres concurrency test. It is a *test-fidelity* gap, not a defect.

**Test coverage [FACT]:** **REAL** — 10 vitest files, all pure functions: capacity, recurrence (incl. month-end/leap/interval-2/until/overdue-recovery), focus-timer helpers, rollover + banner span, **the timezone regression test**, selectors, reorder, onboarding gating, and completeTask branching-against-a-fake. **One pgTAP RLS test exists** — `supabase/tests/tasks_workspace_integrity.test.sql` exercises the task↔workspace co-location guard with *two* users (user A is rejected with `42501` when attaching a task to user B's project/section), but it runs only via `supabase test db` (outside the `npm test`/vitest gate) and covers **only that one guard**. **ABSENT** — *zero* component tests, *zero* hook tests (`useTaskMutations` optimistic/rollback, `useRealtimeSync`, `useTasks` all untested), *zero* integration/e2e (no Playwright/Cypress), and **no broader RLS isolation tests** (cross-tenant SELECT, `focus_sessions`/`workspace_members`). `package.json` has no `@testing-library`, no jsdom, no Playwright — the JS test surface is pure-logic-only by construction, and the wider security model is otherwise "correct by inspection," unguarded by CI.

### 2.6 Security & multi-tenancy

**Verdict [FACT]:** **Solid for a single-user MVP — no critical tenant-isolation holes found.** Every public table has RLS enabled *with* policies (profiles, workspaces, workspace_members, projects, sections, tasks, subtasks, **and focus_sessions** — `focus_sessions.sql:39-45`). All six SECURITY DEFINER helpers pin `search_path = public`, closing the classic privilege-escalation vector. The well-known dangers were checked and are **not** present: a non-owner cannot self-grant `workspace_members` (`members_insert_owner` requires `is_workspace_owner`, derived from `workspaces.owner_id`, not the members table); `profiles` is locked to `id = auth.uid()` so capacity/onboarding flags can't be changed cross-user; the `task_workspace_integrity` migration genuinely closes the cross-workspace project/section attach hole. **No `service_role` key exists anywhere in client code** (grep-confirmed) — the "client is hostile, RLS-first" principle is actually upheld.

**Weaknesses (medium/low, mostly latent until V2 collaboration ships):**
- **[FACT] (medium, adversarially confirmed)** **Weak auth hardening** — `minimum_password_length = 6`, empty `password_requirements`, captcha disabled, MFA disabled, and `enable_signup=true` with `enable_confirmations=false` means a session is issued *without* email verification (`supabase/config.toml`). The only brake is Supabase's per-IP rate limit (30/5min); there is no app-layer lockout. Credential-stuffing/spray against 6-char passwords is cheap. *Both skeptics confirmed medium; nuance: the user-enumeration claim is partly overstated — `signInWithOtp` is called with the default `shouldCreateUser=true` (`LoginPage.tsx:65-68`), so it **creates** users for unknown emails, making OTP enumeration harder, not easier. The real oracle is the verbatim `err.message` on `signInWithPassword` (`LoginPage.tsx:49`).* Severity stays medium because per-user workspace isolation means a cracked credential exposes only that one account's data.
- **[FACT/INFERENCE] (low)** `focus_sessions` has no task↔workspace co-location guard (`SEC-1`); a member could bind a session to another workspace's `task_id` — inert today (single-user), the same class of bug fixed for tasks, left unfixed here. `workspace_members.role` is owner-writable with no integrity guard (`SEC-2`) — decorative today, an escalation surface once a roles UI is built. Both rise to medium/high the moment a second user can join a workspace.
- **[FACT/INFERENCE] (low)** The production anon JWT + project ref are committed in `env.ts:18-20` (intentional, RLS-protected, documented). Not a secret leak, but it means every clone hits the *same production DB* by default and the endpoint is reachable from the open internet with zero setup; rotating requires a code change. Recommend a throwaway/demo default and the real key in deploy config.

### 2.7 SaaS readiness — what a paid product needs that this *doesn't have*

**Verdict [FACT]:** Todonado has **essentially zero commercial SaaS scaffolding.** The whole surface is 5 product routes + `/login` (`AppRoutes.tsx`, `nav.ts`). The data model and all 10 migrations contain **no billing/subscription/plan columns whatsoever.** This is a well-built personal app, not something you can charge for. (Note: CLAUDE.md §5 explicitly defers billing/SSO/team-admin, so this is *deliberate scope*, not regression — but the gap to "paid" is large and untouched.)

| Capability | Status | Evidence / note |
|---|---|---|
| **Billing / Stripe** (customers, subscriptions, checkout, portal, webhooks, dunning) | **❌ table-stakes** | Zero matches outside config templates; no payment dep. **You cannot collect a dollar today.** |
| **Plan tiers + feature gating / entitlements** | **❌ table-stakes** | No plan/tier column on `Profile`/`Workspace`; no paywall. Only flags are `DEFAULT_DAILY_CAPACITY_MINUTES`, `ENABLE_REALTIME`. |
| **Account / profile / settings page** | **❌ table-stakes** | No settings route/nav. `profiles` has `display_name`/`avatar_url` but **no UI to edit them**; the "Account" surface is just email + Log out (`TopBar.tsx:106-129`). Can't change email/password/name in-app. |
| **Password reset / forgot-password** | **❌ table-stakes** | `LoginPage.tsx` has no "Forgot password?", no `resetPasswordForEmail`, no `updateUser`. **A user who forgets is locked out with no recovery path.** |
| **Self-serve account deletion (GDPR/CCPA)** | **❌ table-stakes** | No delete-account UI/RPC. Legally required to operate a paid EU/CA SaaS. |
| **Legal pages** (Privacy, ToS, cookie/DPA) | **❌ table-stakes** | None exist. Stripe and app stores require a published Privacy + ToS before you can charge. |
| **Error tracking + observability** (Sentry/logs/alerts) | **❌ table-stakes** | No Sentry/Datadog dep, **no `ErrorBoundary` anywhere** — first prod bug after payment is invisible and white-screens the user. |
| **CI/CD** (lint/typecheck/test/build on PR, deploy) | **❌ table-stakes** | No `.github/`, no pipeline, no Dockerfile/`vercel.json`. Scripts exist but nothing runs them; every deploy is manual and unverified. |
| **Transactional/lifecycle email** beyond Supabase auth | **❌ important** | Only built-in confirm/magic-link. No Resend/Postmark dep, no templates, no receipts/drips. |
| **Data export / import** (own-your-data, switch-in from competitors) | **❌ important** | No export/CSV/JSON; no import from Todoist/Things. Hurts trust and switching costs. |
| **Product analytics** (activation funnel, retention, usage) | **❌ important** | No PostHog/Mixpanel/Amplitude. **[HYPOTHESIS]** with zero telemetry you'd price and iterate blind — especially damaging given the differentiator is unproven. |
| **Multi-device / offline (PWA service worker)** | **❌ important** | Manifest exists but **no service worker** (no `VitePWA`, no SW registration). Installable icon only; fully online-only. |
| **Automated backups / DR runbook** | **❌ important** | Relies on Supabase tier defaults; no documented PITR/restore. |
| **Support / help / feedback / changelog** | **❌ important** | None. A paid user with a problem has nowhere to go. |
| **Status/uptime page; admin/operator tooling; trial→paid mechanics** | **❌ nice-to-have** | None present. |

---

## 3. Hard truths (no flattery)

- **[HYPOTHESIS — but strongly code-supported] There is no moat. None.** No technical moat (the differentiator is ~95 lines of arithmetic + a CSS bar — `capacity.ts`); no data moat (single-user, AI explicitly banned, so no learning loop); no network effects (collaboration unbuilt); no switching costs (plain tasks in Postgres, trivially exportable); no brand/distribution (web-only PWA, no native apps, no install base). The only edges are *taste* (the dark aesthetic + anti-guilt copy) and *being cheap/calm/no-AI* — both real but fragile and copyable.
- **Is it genuinely differentiated vs Todoist / TickTick / Things / Sunsama? [HYPOTHESIS] On one axis, yes; as a product, no.** The effort-budget meter is something the cheap incumbents genuinely lack — but strip it and Todonado is a strictly worse, single-user, web-only Todoist. It sits in an awkward middle: too thin to beat a ~$4 Todoist on breadth/platforms, too primitive (no calendar, no AI, no time-blocking, no mobile app) to beat ~$20 Sunsama on the planning ritual it's imitating. **Motion already does "effort-aware day planning" — automated and calendar-grounded — proving the concept is neither novel nor ownable.**
- **The "command center" branding overreaches what the code does.** `TodayPage` titled "Your Command Center" is a to-do list with a budget gauge. The gap between grandiose positioning and thin reality is itself a credibility risk with discerning buyers.
- **The most defensible idea in the product doesn't exist yet.** Insights (planned-vs-actual, your real estimation bias over weeks) is the one feature that could turn the meter into a compounding, sticky, payable hook — and it's an empty `PagePlaceholder`.
- **The differentiator is garbage-in/garbage-out and fails silently.** Skip the effort field and the meter reads 0 with no warning (`capacity.ts:31-33`). The product never nudges, defaults, or auto-suggests an estimate.
- **What would make a real person switch and PAY, and does it earn that today? [HYPOTHESIS]** The honest "you literally can't fit 9h into a 6h day — move these to tomorrow" moment is genuinely good for chronic over-committers. But the product does **not** currently earn the switch: it needs manual estimates with no assist, ignores the real calendar, and runs only in a browser tab on one device. It's a great *demo*; it is not yet a daily driver worth paying for.

---

## 4. Target blueprint — what "complete + worth paying for" looks like

### 4.1 Target product spec

**Core paid value [HYPOTHESIS]:** *"The calm daily planner that makes your day honest — and gets smarter about your real capacity every week."* The wedge is the **overbooking-with-minimal-deferral moment**, made low-friction to feed and backed by a **personal estimation-accuracy flywheel**.

**Must-have feature set to be worth paying for:**
1. **Frictionless effort capture** — quick-pick chips (15/30/45/60/90), last-used default, inline natural-language parse ("draft deck 45m tomorrow"), and a one-tap "estimate" suggestion seeded from the task's own historical focus time. Make the meter *meaningful by default*, not contingent on discipline.
2. **The estimate→actual flywheel (Insights, built for real)** — planned-vs-actual effort per task and per week, "you consistently underestimate by ~40%," roll-over patterns, focus trends. This is the compounding reason to stay and the justification for a recurring charge.
3. **A real return hook** — daily plan + end-of-day shutdown prompt via web-push / PWA notification (and eventually native). Without this, "daily" is aspirational.
4. **Calendar-aware capacity (one-way busy import)** — subtract real meetings from the day's capacity so "honest" stops being a fiction. This is the single biggest credibility upgrade vs the current flat number.
5. **Reschedule anywhere** — "send to tomorrow / pick a date" from any row and from the roll-over banner (today it only ever rolls *to* today), plus bulk triage in the Inbox.
6. **Trust & safety basics** — confirm/undo on destructive actions, visible error states, password reset, account/settings, data export.

**Activation loop (target):** signup → onboarding *requires at least one effort estimate* so the meter visibly fills (today it's optional and can dead-end at 0%) → land on a planned Today → first "you're over by 2h, move these" → felt value in <3 minutes.

**Retention loop (target):** morning notification → open Today → one-tap roll-over of yesterday → adjust effort (auto-suggested) → meter keeps you honest → end-of-day shutdown prompt → weekly Insights shows your estimation getting better. The notification + Insights are the engine the current product lacks.

**Explicitly OUT of scope (keep the guardrails):** full AI auto-planning/auto-scheduling (Motion's lane — collides with the no-AI identity), two-way calendar sync, team admin/SSO, native apps *before* PWA-push validates retention, and Kanban/Gantt/doc-style bloat. Don't try to out-feature Todoist; win on the one ritual.

### 4.2 Target UX / design direction (the standard each screen must hit)

- **Today:** must become an actual execution surface, not a flat list. Add a "now / next" focal task, intra-day structure (even lightweight morning/afternoon buckets or optional time-blocks), and the calendar busy overlay on the meter. Every state designed: loading skeleton, error-with-retry, empty, over/near/clear.
- **Capture (QuickAdd/Inbox):** estimate must be one tap (chips + NL parse), never a bare number box. Inbox gets bulk-select, multi-schedule, filter/sort.
- **Insights:** ship it. Planned-vs-actual hero chart, estimation-bias number, roll-over and focus trends — the screen that earns the subscription.
- **Global:** real ⌘K command palette + working search (remove the fake), confirm+undo on all destructive actions, a toast on every mutation failure, a global `ErrorBoundary`, and a `prefers-reduced-motion` path. Kill the "Phase 0" string and the self-contradictory Insights placeholder copy.
- **Bar to hit:** every interactive surface has explicit loading/empty/error states; no advertised-but-disabled affordances ship; destructive = reversible; the flagship meter is calendar-grounded.

### 4.3 Target architecture

- **Data fetching:** replace the unbounded `select('*')` with **server-side windowing** — Today/Inbox query by `scheduled_for`/`status`/date-range using the indexes that already exist; paginate or archive completed history (`status in ('done','cancelled')` older than N days). This is the prerequisite for scale and must precede any growth.
- **Realtime:** scope `sections`/`subtasks` subscriptions (add a denormalized `workspace_id` or filter via a join/RPC), and move from whole-cache invalidation to **targeted cache patching** from payloads (or at least narrower keys) so a roll-over of N tasks doesn't trigger N full refetches. Batch loop-mutations (`rollAll`) into a single request.
- **Multi-tenancy:** decide the story. Either (a) commit to single-user and **stop calling it "collaboration-ready,"** or (b) actually wire multi/shared workspaces — invite UI, `WorkspaceProvider` selecting among many, per-workspace keys — and **add the co-location guards** (`focus_sessions` task↔workspace, `workspace_members.role` integrity) *before* a second user can join.
- **Auth/cache correctness:** clear the query cache on auth change (fix cross-account bleed); user-scope `qk.workspace`/`qk.profile`.
- **Billing layer:** Stripe (customers/subscriptions/checkout/portal/webhooks) + an `entitlements`/`plan` column on `profiles` or `workspaces` + a gating primitive. None of this exists; it's net-new.
- **Testing & observability bar:** add `@testing-library` + jsdom for hook/component tests (start with the optimistic-update + realtime-refetch interplay and the recurrence spawn-once against a real local Postgres / pgTAP); add a **two-user RLS integration test** before collaboration ships; wire CI (lint/typecheck/test/build on PR); add Sentry + a global `ErrorBoundary`; add product analytics (activation/retention funnel). Generate DB types from the schema to kill drift.

---

## 5. Gap analysis + prioritized roadmap (current → target)

> Effort: **S** ≈ ≤1 day · **M** ≈ a few days · **L** ≈ 1–3 weeks. Ruthlessly ordered.

### ⭐ Highest-leverage next action (do this first)
**Run a 10–20 person validation test of the core behavioral assumption *before building anything else*** (S, instrument-only): do target users actually enter `effort_minutes`, and does the meter change a real scheduling decision? Everything in Phases 1–2 is wasted if the answer is no. This requires the analytics gap to be closed first (below) — so the *literal* first engineering task is **add product analytics + a basic event funnel (effort-entered, meter-crossed-capacity, suggestion-accepted, day-returned)**, then put the app in front of real users. **Why:** the entire product thesis is unvalidated; this is the cheapest possible kill/confirm. **Payoff:** prevents months of building on a false premise.

### Phase 0 — Must-fix before ANY real user touches it (correctness / safety / data-loss)
| Item | What & why | Effort | Payoff |
|---|---|---|---|
| Confirm + undo on destructive actions | Delete task cascade-deletes its subtasks (`initial_schema.sql:118`) with no confirm/undo; delete subtask too (`SectionGroup.tsx:79-88`, `tasks/components/SubtaskList.tsx`). One misclick = irreversible loss. (Section/project delete only `SET NULL`s children — not a cascade.) | S | Prevents the worst trust-killer |
| Surface mutation + fetch errors | Every `onError` is a silent rollback; failed fetch shows the *empty* state (`useTaskMutations.ts`, `TodayPage.tsx:124`). Add error toasts + per-page error/retry. | S–M | Stops "the app ate my task" churn |
| Global `ErrorBoundary` | One bad render white-screens the SPA; no recovery (grep: none). | S | Survivable failures, not blank screens |
| Password reset flow | No recovery path today (`LoginPage.tsx`); a forgotten password = permanent lockout. | S | Table-stakes; users *will* forget |
| Make `completeTask` atomic | Non-transactional UPDATE+INSERT can silently drop a recurrence on INSERT failure. Wrap in an RPC/transaction. | S | Correctness of the recurrence feature |
| Auth hardening | `min_password_length` ≥ 8 + complexity, enable captcha + email confirmations, generic auth error (`SEC-4`, `config.toml`/`LoginPage.tsx:49`). | S | Closes the most exploitable real surface |
| Remove demo-ware artifacts | Kill `"Phase 0 · Foundation"` (`Sidebar.tsx:58`), the fake disabled Search, and the self-contradictory Insights placeholder copy. | S | Stops "unfinished" perception |

### Phase 1 — Minimum to be a credible paid SaaS (smallest set that earns money)
| Item | What & why | Effort | Payoff |
|---|---|---|---|
| **Frictionless effort capture** | Quick-pick chips + last-used default + NL parse in `QuickAdd`. The differentiator is dead if effort stays a bare number box. | M | Makes the wedge actually function |
| **Insights v1 (estimate→actual)** | Build the placeholder into a real screen: planned-vs-actual, estimation-bias, roll-over/focus trends. The compounding reason to pay. | L | The only durable retention hook |
| **Return hook (PWA web-push)** | Service worker + daily plan / end-of-day notification. "Daily" needs an engine. | M–L | Turns one-time aha into a habit |
| Account/settings + data export | Edit profile/email/password, export tasks (JSON/CSV), self-serve account deletion (GDPR). | M | Table-stakes trust + legal |
| Billing + plan gating | Stripe + `entitlements` column + paywall on the retention features (Insights/Focus/recurrence). | L | You literally cannot charge without it |
| Legal + CI + Sentry | Privacy/ToS pages; CI pipeline; error tracking. | M | Required to operate and not fly blind |
| Server-side query windowing | Replace unbounded `useTasks`/`useFocusSessions` with date/status-scoped queries + archive old completed tasks. | M | Removes the per-user scale cliff |

### Phase 2 — Differentiation / retention / growth
| Item | What & why | Effort | Payoff |
|---|---|---|---|
| **Calendar busy-import (one-way)** | Subtract real meetings from capacity — the biggest honesty/credibility upgrade vs Sunsama. | L | Makes "honest day" true, not fiction |
| Reschedule-anywhere + bulk triage | "Pick a date" from any row + the roll-over banner; bulk Inbox actions. | M | Removes daily friction |
| Realtime precision + batching | Scope sections/subtasks subscriptions; targeted cache patching; batch loop-mutations. | M | Cuts cost; smooth at scale |
| Today as execution surface | "Now/next" focal task + lightweight intra-day structure. Earn the "command center" name. | L | Closes positioning↔reality gap |
| Auto-estimate from focus history | Seed an estimate from a task's past actual focus time — low-friction, no-AI "smart default." | M | Strengthens the wedge defensibly |

### Backlog / nice-to-have
Status/uptime page, admin tooling, import-from-competitors, command palette polish, wide-screen layouts, `prefers-reduced-motion`, fractional-position renormalization job, generated DB types, two-user RLS integration tests (do *before* collaboration ships).

### Explicitly CUT / ignore as a waste of time
- **Multi-workspace collaboration** until single-user retention is proven — it's the biggest build for the least validated demand, and CLAUDE.md already defers it. Stop marketing "collaboration-ready."
- **Native apps** before PWA-push validates that a return hook even moves retention.
- **Any AI auto-planning** — it collides with the product's identity *and* walks straight into Motion's strength. The no-AI/calm/manual position is the only honest differentiation; don't abandon it to chase a fight you lose.
- **Two-way calendar sync** — high effort, off-thesis.
- **Breadth features** (labels/filters/Kanban/Gantt) to "match Todoist" — you will not out-breadth the incumbents; it dilutes the wedge.

---

## 6. Monetization & positioning — **ALL HYPOTHESES (no user data; must be validated)**

- **ICP [HYPOTHESIS]:** the *self-aware chronic over-committer* — a solo knowledge worker / indie hacker / freelancer / grad student who already knows they overplan and feels daily guilt about the unfinished pile (matches `docs/PRD.md` target user). Psychographic, not demographic: wants a planning *ritual* and a reality check, is anti-AI / pro-manual-control, likes calm dark aesthetics, lives in a browser. Essentially "Sunsama's buyer who won't pay $20 and doesn't need calendar sync yet." Real but **narrow**, and it's the *same* person Sunsama/Motion target.
- **Wedge vs competitors [HYPOTHESIS]:** the effort-budget meter + minimal-deferral suggestion that the cheap incumbents (Todoist ~$4/mo, TickTick ~$3/mo — *approx., 2026 web search*) genuinely lack, sold as "calm, cheap, manual, no-AI" against the heavy/expensive ritual tools (Sunsama ~$20/mo, Motion ~$29/mo; Things ~$80 one-time, Apple-only — *approx.*).
- **The "aha" that justifies paying [HYPOTHESIS]:** *"I literally cannot fit 9 hours into a 6-hour day, and the app made me face it this morning instead of at 6pm with a guilt-pile."* Genuinely resonant — but today it's earned only as a demo, because it needs manual estimates, ignores the real calendar, and runs only in a browser tab.
- **Pricing hypothesis [HYPOTHESIS]:** single paid plan **~$6/mo annual ($59–72/yr)** / $8 monthly, 14-day trial — *below* the ritual tier, *slightly above* the commodity list tier. Don't undercut to $3 (you lose the breadth/platform fight to TickTick/Todoist). Realistically, for a web-only single-user tool against free incumbents, willingness-to-pay may cluster at $4–6.
- **Retention hook [HYPOTHESIS]:** the daily plan→roll-over→shutdown ritual, made sticky by accumulating estimate-vs-actual data (Insights) — "you underestimate by 40%, here's your real capacity." Today the hook is aspiration, not mechanism: no notifications, no Insights.
- **Free → paid line [HYPOTHESIS]:** **Free** = unlimited capture/Inbox/projects + basic Today list + manual scheduling + a single-day capacity meter (let everyone feel the aha once). **Paid** = the daily-habit layer: full effort estimating + the overbooking auto-suggester + roll-over/recovery history + Focus sessions + recurring tasks + **Insights** (which must be built first — there's little a disciplined user can't get free elsewhere until it exists). Give away the demo that sells; charge for the mechanics that retain.

**What evidence validates or kills each assumption [HYPOTHESIS]:**
1. *Users will enter effort.* **Validate:** >60% of scheduled tasks carry a non-null estimate after week 1 unprompted, and users say the meter changed a decision. **Kill:** they skip the field, the meter sits near 0, they ignore it → you're a worse Todoist.
2. *The warning changes behavior.* **Validate:** users frequently accept "move N to tomorrow" and report fewer overbooked days. **Kill:** they blow past the red meter daily (it never blocks) → emotionally nice, behaviorally inert.
3. *A niche will pay ~$6/mo.* **Validate:** a price/landing test converts defensibly and trial users cite *the capacity meter* as the reason. **Kill:** "TickTick already does focus + more for less" / WTP clusters at $0–3.
4. *Web-only single-user is enough.* **Validate:** beta users adopt it as their primary planner without churning for a phone app / calendar sync. **Kill:** "I can't run my day from a browser tab / it doesn't know my meetings." (No native app, no calendar code — high risk.)
5. *"Effort-aware planning" is ownable.* **Validate:** 6–12 months pass and no incumbent ships a comparable meter. **Kill:** TickTick/Todoist/Things add an "estimated time vs daily budget" view (trivial — they already store the substrate), erasing the only differentiator. No moat prevents this.

---

## Highest-leverage next move

**Instrument the app (analytics + funnel events) and put it in front of 10–20 real over-committers to answer one question before building anything else: do they actually enter effort estimates, and does the meter change a real decision? If yes, build the estimate→actual flywheel (Insights) and a daily return hook. If no, the wedge doesn't function and no amount of polish or pricing will save it.**
