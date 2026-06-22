# Todonado — Superapp Roadmap (proposal)

> **Status:** review-only proposal. Nothing here is built or scheduled. The
> wellness suite (breathwork, sleep sounds, guided meditation, supplement/
> medication tracker) is already approved and shipped behind `FEATURES.wellness`.
> This doc explores where Todonado could grow next as a productivity &
> organization superapp.

## How to read this

Every feature is judged against **one lens**: *does it deepen the
effort-aware capacity-planning wedge, or just add surface area?* Todonado's
differentiator is being **honest about capacity** (plan a day that actually
fits) and **recovery over guilt**. Generic productivity features are easy to
list and hard to win on; the proposals below are ranked by how much they
reinforce that wedge.

**Effort:** `S` ≈ days · `M` ≈ 1–2 weeks · `L` ≈ multi-week / needs new infra.

**Verdict tags:**
- **▲ high-leverage** — deepens the wedge; build-worthy.
- **⏳ needs real users first** — sound, but value only appears with usage data, a
  second user, or accumulated history. Premature pre-PMF.
- **⚠ scope-creep trap** — feels essential, pulls toward a generic competitor,
  dilutes positioning. Listed so the decline is deliberate, not accidental.

A recurring pattern emerges across **every** theme below: the high-leverage pick
is always the one that **feeds the capacity meter** (calendar busy time, week
horizon, habit/energy effort, per-assignee load, auto-estimates). The traps are
always **generic parity features** every competitor has and none differentiate
on (time-block calendar, gamification, generic wellness trackers, distraction
blocking, chat agent, public API). Use that as the filter.

---

## 1. Planning & scheduling

The core surface. The goal: extend the wedge from a single honest *day* to a
defensible multi-day planning system — without becoming a calendar.

### Calendar busy-import for capacity (read-only) — ▲ high-leverage
- **What:** One-way import of external calendar events as read-only "busy"
  blocks that subtract committed time from the day's available capacity.
- **Why it fits:** `computeCapacity()` treats `daily_capacity_minutes` as fully
  task-available — a lie if you have 3h of meetings. Busy minutes become a
  deduction (effective capacity = capacity − busy), making the overbooking guard
  *honest*. Sanctioned by CLAUDE.md (V1 roadmap; the §5 exclusion is two-way
  sync, read-only is carved in).
- **Effort:** L · **Risk:** privacy (store only date + duration, never event
  titles/attendees; OAuth scope + retention discipline; 3rd-party ToS).
- **EV:** Highest in the theme — converts the meter from "capacity vs my
  estimates" to "capacity vs my real day." The most credible proof of the
  positioning.
- **Depends on:** OAuth/token holder + a `busy_blocks` table; `capacity.ts`
  accepts a busy-minutes deduction. (See also the ICS-only slice under
  Integrations for a cheaper first step.)

### Week view (multi-day capacity planning) — ▲ high-leverage
- **What:** A 7-day horizon showing each day's planned effort vs capacity as a
  row of meters, with drag-to-reschedule between days to balance load.
- **Why it fits:** `insights.dailyEffortSeries()` *already* computes per-day
  planned/capacity/status using the same `computeCapacity()`. Week view is
  mostly a presentation layer over existing pure logic; dragging a task just
  changes `scheduled_for` via the existing mutation. Extends "realistic day" to
  "realistic week" with almost no new data model.
- **Effort:** M · **Risk:** low.
- **EV:** High. Drag-to-rebalance is where capacity-awareness becomes a planning
  superpower instead of a passive warning.
- **Depends on:** reuses `dailyEffortSeries` + `computeCapacity` + the existing
  drag library (Projects reorder).

### Scheduling-history table (plan-vs-actual ground truth) — ⏳ needs real users first
- **What:** Append-only log of each `(task, scheduled_for)` assignment over time.
- **Why it fits:** `insights.ts` documents this exact gap — without history,
  `scheduled_for` reflects only the *current* day, so "slipped" is a lower bound.
  Every downstream planning-quality feature (real plan-vs-actual, slip rate,
  estimation accuracy, smart roll-over) is blocked by it.
- **Effort:** M · **Risk:** privacy (one more per-task log under existing RLS).
- **EV:** Low as a visible feature, high as an enabler. **Worth starting early
  anyway** — history can't be reconstructed retroactively; every week you wait,
  truth is permanently lost.
- **Depends on:** a hook in `useTaskMutations` to record `scheduled_for` changes.

### Day & week templates (plan presets) — ⏳ needs real users first
- **What:** Save a set of tasks (titles + effort + project/section) and stamp it
  onto a day/week in one tap.
- **Why it fits:** A template is just a stored array of task shells reusing
  `NewTaskInput` + `effort_minutes`/`scheduled_for`; applied templates carry
  effort, so the meter immediately reflects a realistic preset day. On the V2
  roadmap.
- **Effort:** M · **Risk:** low · **EV:** Medium — a power-user/retention feature
  whose value compounds only once people plan repeatedly.
- **Depends on:** `templates` + `template_items` tables.

### Smart roll-over redistribution — ⏳ needs real users first
- **What:** Recovering unfinished tasks spreads them across the next few days so
  no day breaches capacity, instead of dumping all onto today.
- **Why it fits:** Today's one-tap "move to today" can instantly overbook the day
  the meter just warned about — a contradiction with the core.
  `suggestTasksToMoveTomorrow()` already does the inverse; the same ranking can
  place each leftover on the first day with headroom. Makes "recovery over guilt"
  also *capacity-respecting*.
- **Effort:** M · **Risk:** low · **EV:** Medium-high — closes the gap between the
  two flagship features.
- **Depends on:** Week view (per-day headroom) + ideally the scheduling-history
  table.

### Intra-day time-blocking (timeline view) — ⚠ scope-creep trap
- **What:** Assign tasks a start time on a vertical day timeline.
- **Why it's a trap:** The wedge is a daily effort *budget* (a bucket), not a
  clock-positioned schedule. Adding `start_time` turns Todonado into a
  Sunsama/Motion calendar competitor, pulls effort toward generic calendar UX,
  and creeps toward the excluded two-way sync. High user demand, high dilution.
- **Effort:** L · **Risk:** strategic, not legal. **Defer** until the budget
  model is clearly won.

---

## 2. Habits & streaks

The wellness tracker already proved the streak primitive. The question is whether
habits feed planning or become a sidecar.

### Habits as a first-class entity (`habits` + `habit_logs`) — ▲ high-leverage
- **What:** A `habits` table + append-only `habit_logs`, daily/weekly cadence —
  the check-in + streak surface for the theme.
- **Why it fits:** Clones the proven wellness pattern almost verbatim:
  `habit_logs` mirrors `wellness_logs` (append-only, owner-only RLS), and the
  streak reuses `computeStreak()` / `takenDaysForItem()` / `shiftDay()` from
  `tracker/tracking.ts` (today-or-yesterday tolerance included). Near-zero new
  pure logic.
- **Effort:** M · **Risk:** low · **EV:** High — a daily re-open reason; turns a
  one-off helper into a reusable primitive.
- **Depends on:** none (helpers + RLS conventions exist).

### Routines that feed Today (habit effort → capacity) — ▲ high-leverage
- **What:** Give habits optional `effort_minutes` + a "plan into Today" flag so a
  checked/scheduled habit contributes its effort to the capacity meter.
- **Why it fits:** The *only* habit proposal that deepens the wedge. `sumEffort()`
  already sums any effort-bearing item, so a 30-min morning routine becomes real
  load, not free time — meter, overbooking guard, and roll-over all keep working.
  This is the reason to use Todonado's habits over Habitica/Streaks.
- **Effort:** M · **Risk:** low · **EV:** Highest strategic value in the theme.
- **Depends on:** the `habits` table.

### Recurring-task → habit promotion — ▲ high-leverage (but pick ONE model)
- **What:** Flag an existing recurring task as a "habit" to show streaks + a
  check-in chip, instead of building a parallel scheduling engine.
- **Why it fits:** Tasks already carry `recurrence_*` and a spawn-next-occurrence
  engine; a daily recurring task *is* a habit minus the streak view. Could deliver
  ~70% of habit value with near-zero new schema.
- **Effort:** S · **Risk:** low · **EV:** High per effort.
- **Decision required:** ship *either* this *or* the dedicated `habits` table —
  **not both.** Two overlapping cadence systems is the real trap here.

### Habit insights (consistency rate, best streak, heatmap) — ⏳ needs real users first
- **What:** A habits panel in Insights: completion rate, current/longest streak,
  GitHub-style heatmap.
- **Why it fits:** Insights is an explicit placeholder; heatmap/rate are pure
  functions over the same `Set<string>` of days `computeStreak` consumes.
- **Effort:** M · **Risk:** low · **EV:** Real but lagging — empty until users
  have weeks of logs.

### Streak protection (freezes, grace days, vacation mode) — ⏳ needs real users first
- **What:** Freeze a streak for planned off-days / grace days so one miss doesn't
  reset (Duolingo-style).
- **Why it fits:** Sits on `computeStreak` via excused dates; brand-aligned
  ("recovery over guilt, not streak-shaming"). But it's polish on a mechanic that
  must first prove people check in daily at all.
- **Effort:** M · **Risk:** low · **EV:** Long-term retention; premature now.

### Gamification (XP, levels, badges, rewards) — ⚠ scope-creep trap
- **What:** Points/levels/badges/coins across habits and tasks.
- **Why it's a trap:** Generic engagement-bait bolted on; pulls toward
  Habitica-style mechanics and away from "mission-control, honest about
  capacity." Large surface (badge taxonomy, economy balancing) every habit app
  has and none differentiate on. **Recommend not building.**
- **Effort:** L · **Risk:** low (dilution risk).

---

## 3. Wellness extensions

Turn subjective energy/recovery state into a real planning signal — don't become
a generic wellness app.

### Energy check-in → capacity adjustment — ▲ high-leverage
- **What:** A 5-second daily mood/energy slider (1–5) that proposes a same-day
  capacity adjustment (low → lighter day; high → offer headroom), accept or
  ignore.
- **Why it fits:** The single feature that fuses the wellness suite to the
  differentiator. `computeCapacity()` already takes `capacityMinutes` as a
  parameter, so an energy reading can scale that input for the day with no meter
  math changes. One small `energy_logs` table (mirrors `wellness_logs`). Makes
  capacity *dynamic and personal* instead of a fixed slider.
- **Effort:** M · **Risk:** low (frame as a planning aid, not a clinical mood log)
  · **EV:** High — a daily re-engagement hook *and* a wedge deepener.
- **Depends on:** `energy_logs` + a per-day capacity override on TodayPage.

### Recovery-aware roll-over tone — ▲ high-leverage
- **What:** On low energy / poor sleep, the roll-over + overbooking guard shift
  to a recovery frame and trim more aggressively.
- **Why it fits:** Operationalizes "recovery over guilt" with a measured input.
  Mostly copy + a threshold on existing `suggestTasksToMoveTomorrow()` /
  banners — no new tables beyond `energy_logs`.
- **Effort:** S · **Risk:** low · **EV:** Medium, cheap, on-thesis.
- **Depends on:** Energy check-in.

### Break / micro-recovery nudge in Focus Mode — ▲ high-leverage
- **What:** After a configurable run of focus minutes, offer a short break that
  deep-links into breathwork or sleep sounds; log the break.
- **Why it fits:** Connects two built pillars (`focus_sessions` + breathwork/
  audio) with no new content, and gives the breathwork module organic traffic.
- **Effort:** S · **Risk:** low (keep opt-in and quiet) · **EV:** Medium.

### Energy vs throughput correlation in Insights — ⏳ needs real users first
- **What:** Insights panel correlating energy check-ins with completion / focus
  rate ("80% of plan on high-energy days vs 50% on low").
- **Why it fits:** Reuses the day-keyed insights pipeline; energy logs key by the
  same `yyyy-MM-dd` buckets. Justifies the check-in and the wedge.
- **Effort:** M · **Risk:** low · **EV:** Medium-high *after* ~2 weeks of data.
- **Depends on:** Energy check-in.

### Daily wellness streaks & reminder digest — ⏳ needs real users first
- **What:** Streak counters + a daily reminder/digest for logging.
- **Why it fits:** Operates on existing day-keyable logs; reminders lean on the
  PWA. But badly-tuned reminders erode trust and only pay off with returning
  users.
- **Effort:** M · **Risk:** low · **EV:** Low-to-medium, gated on scale.

### Hydration / screen-time / journaling trackers — ⚠ scope-creep trap
- **What:** Standalone hydration counters, screen-time, free-text journal.
- **Why it's a trap:** Parallel trackers that *don't* feed capacity or planning —
  they make Todonado a generic wellness app. Journaling in particular drags in
  health-adjacent expectations and free-text PII with no planning payoff.
- **Effort:** L · **Risk:** privacy (sensitive free-text PII) / health-claim
  territory. High opportunity cost vs the energy→capacity work.

---

## 4. Focus & deep work

Focus already has a drift-resistant timer and rich session data. The leverage is
in *closing the plan→execute→learn loop*, not new capture surfaces.

### Effort calibration from focus actuals — ▲ high-leverage
- **What:** After a task-bound session, compare planned vs actual focus time
  ("estimated 50m, focused 78m") with one-tap "update this task's effort," and
  aggregate a personal "you under/over-estimate by ~X%" stat.
- **Why it fits:** The tightest possible loop on the wedge. `focus_sessions`
  already stores `planned_minutes` (seeded from `effort_minutes`) and
  `actual_seconds`. Comparing them makes the capacity meter progressively
  *honest* — the differentiator gets smarter with use, no content/integrations.
- **Effort:** M · **Risk:** low · **EV:** High; compounds and is sticky.
- **Depends on:** existing `focus_sessions` + `effort_minutes`.

### Focus from Today (start-sprint inline) — ▲ high-leverage
- **What:** A "Focus" affordance on each Today task that deep-links into Focus
  pre-selected, duration pre-filled from `effort_minutes`.
- **Why it fits:** Closes the execution half of "Plan a realistic day. Execute
  with focus." `SetupView` already accepts `initialTaskId` and pre-fills minutes;
  this wires the Today row to it. Reinforces that `effort_minutes` is the same
  currency for planning *and* doing.
- **Effort:** S · **Risk:** low · **EV:** High value for low cost.

### Ambient focus audio in Focus Mode — ⏳ needs real users first
- **What:** Mount the existing `AudioPlayer` in the running focus view for a
  looping ambient track during a sprint.
- **Why it fits:** Pure reuse — player + manifest already exist; sleep-category
  tracks are loop-friendly; the sleep-timer maps to session end.
- **Effort:** S · **Risk:** content-licensing — **inert until CC0/owned audio
  exists** (or ship Web-Audio-generated noise). EV capped at zero until lawful
  audio is supplied.

### Distraction tally insights + streaks — ⏳ needs real users first
- **What:** Promote the per-session interruption counter into trends + a
  "clean sprints" (zero-interruption) streak.
- **Why it fits:** `interruptions` + `actual_seconds` already logged;
  derived-only. A differentiated "focus quality" metric — but noisy until many
  sessions accumulate.
- **Effort:** M · **Risk:** low.

### Website/app distraction blocking — ⚠ scope-creep trap
- **What:** Block distracting sites/apps during a sprint.
- **Why it's a trap:** A PWA *cannot* block other tabs or OS apps — real
  enforcement needs a browser extension or native app, both on the DO-NOT-BUILD
  list. The buildable subset is placebo theater.
- **Effort:** L · **Risk:** privacy (browsing/activity access). Do not start.

### Pomodoro / sprint-rhythm presets — ⚠ scope-creep trap (keep tiny if at all)
- **What:** Cadence presets (25/5, 50/10, 90/20) that auto-chain work+break.
- **Why it's borderline:** Cheap given the existing timer (and `task_id` null
  already supports non-task breaks), but it's table-stakes parity, not a
  differentiator — and configurable cadences/long-breaks/notifications balloon
  fast. If built, cap it at 2–3 fixed presets.
- **Effort:** M · **Risk:** low.

---

## 5. Collaboration & sharing

`workspace_members` + roles + RLS helpers already exist, but there's no way to
put a second human in a workspace. This whole theme is a **V2 bet that needs
demand validation first.**

### Collaboration fake-door (`feature_intents`) — ▲ high-leverage
- **What:** An "Invite a teammate" / "Share this project" button that records a
  `feature_intents` row (new `feature_key 'collaboration'`) and shows a
  coming-soon/waitlist state.
- **Why it fits:** `feature_intents` already exists as an insert-only,
  no-read-back fake-door (used for the wellness concepts). The cheapest, most
  honest way to learn whether the single-player base wants collaboration before
  spending M/L on invites/assignment/comments.
- **Effort:** S · **Risk:** low · **EV:** High leverage per cost — de-risks the
  entire theme.
- **Depends on:** extend the `feature_intents.feature_key` CHECK.

### Task assignment (`assignee_id`) + per-assignee capacity — ▲ high-leverage (once there are teams)
- **What:** `tasks.assignee_id` (FK to a workspace member) + a capacity meter
  *per assignee*.
- **Why it fits:** The only collaboration feature that deepens the wedge: tasks
  already carry effort + schedule + workspace; adding an assignee lets the
  existing capacity/overbooking logic run per person. "Don't dump 10h on a
  teammate with 6h" is a real moat vs generic team to-do apps.
- **Effort:** M · **Risk:** low (nullable column + RLS WITH CHECK that assignee is
  a member) · **EV:** High — the honest reason to collaborate at all.
- **Depends on:** Workspace invites.

### Workspace invites (email/username) + member roster — ⏳ needs real users first
- **What:** Invite-by-username/email → `workspace_members` row + a roster UI.
- **Why it fits:** Roles, RLS helpers, and `resolve_login_email` /
  `username_available` RPCs already exist; this is the missing "add a second
  human" primitive everything else depends on. Pure plumbing — zero value until
  two users want a shared space.
- **Effort:** M · **Risk:** privacy (user-discovery surface; needs invite-accept
  + rate limiting — already flagged in the username migration).

### Shared project view + presence/filter — ⏳ needs real users first
- **What:** Render Projects for multi-member workspaces (creator/assignee,
  filter by assignee, live presence via existing realtime).
- **Why it fits:** RLS already allows all members to read/write within a
  workspace; this is the UI to make that legible. Table-stakes parity, not a
  wedge-deepener.
- **Effort:** M · **Risk:** low · **Depends on:** Task assignment.

### Task comments / activity thread — ⚠ scope-creep trap
- **What:** A `comments` table + inline thread + activity log.
- **Why it's a trap:** Feels essential but adds a whole content surface
  (notifications, mentions, edit history) without touching the wedge; easy to
  over-build into a discussion app. Defer until users hit the wall.
- **Effort:** M · **Risk:** privacy (UGC + attribution).

### Read-only public share link — ⚠ scope-creep trap
- **What:** A tokenized public read-only URL for one project.
- **Why it's a trap:** A second, parallel visibility model bolted onto an
  RLS-first app — highest blast radius here (token leakage exposes task content).
  High complexity for an external-stakeholder use case the wedge hasn't validated.
- **Effort:** L · **Risk:** privacy/legal (public unauthenticated exposure).

---

## 6. Integrations

CLAUDE.md sanctions exactly one: read-only calendar. Everything else needs
server-side infra the anon-key + RLS architecture doesn't have — validate with
fake-doors first.

### ICS-only busy import (paste a secret calendar URL) — ▲ high-leverage
- **What:** The no-OAuth slice of calendar import: paste a Google/Outlook/Apple
  "secret iCal URL"; Todonado polls it for busy blocks that feed the meter.
- **Why it fits:** Same capacity-core payoff as full calendar sync (events →
  reduced `capacityMinutes`) but an ICS URL is just an HTTP GET — no OAuth, no app
  review. Fastest path to proving "real day vs capacity," reusing the same
  `busy_blocks` shape as the full feature.
- **Effort:** M · **Risk:** privacy (the ICS URL is a bearer secret — store
  RLS-isolated, never expose; CORS may force a server-side fetch).
- **EV:** De-risks the L-effort full calendar feature at M effort.

### One-way calendar sync (Google OAuth) — ▲ high-leverage
- **What:** The full OAuth version of the above (Google Calendar).
- **Why it fits:** THE sanctioned integration; lands directly in the capacity
  core with zero meter-math changes.
- **Effort:** L · **Risk:** privacy (refresh tokens need a server-side secret
  holder — a Supabase Edge Function, not the anon client; store busy/free +
  duration only) + Google app-review overhead.
- **EV:** Highest in the theme — but ship ICS first.

### Standard export (ICS + CSV) — ▲ high-leverage
- **What:** Extend the existing JSON dump to an `.ics` feed of scheduled tasks +
  CSV of tasks/focus history.
- **Why it fits:** `exportData.ts` already gathers everything — pure formatter, no
  new tables. An `.ics` of `scheduled_for` is the read-only mirror of calendar
  import; CSV feeds users' own analysis (complements Insights).
- **Effort:** S · **Risk:** low (user's own data, client-side; improves GDPR
  posture) · **EV:** Cheap trust/portability signal; pairs with import.

### Import from Todoist / TickTick / CSV — ⏳ needs real users first
- **What:** One-time onboarding importer into projects → sections → tasks, effort
  defaulting to null so users estimate as part of activation.
- **Why it fits:** Reuses the task model + export plumbing; lowers switching cost
  and pulls imported tasks into the estimate-then-plan loop. Client-side parsing →
  low risk.
- **Effort:** M · **Risk:** low (messy CSVs, reimport dedupe) · **EV:** Real
  conversion lever *once there's an acquisition funnel*.

### Slack / email quick-capture → Inbox — ⚠ scope-creep trap (fake-door it)
- **What:** Forward email / Slack slash-command into the Inbox.
- **Why it's a trap:** Maps cleanly to Inbox capture, but real inbound needs a
  mail receiver / published Slack app / webhook server — none exist, and §5 lists
  Slack+email as DO-NOT-BUILD-YET. **Honest move:** a `feature_intents` fake-door
  (`'slack_capture'`/`'email_capture'`) to measure demand for ~S effort.
- **Effort:** M (real) / S (fake-door) · **Risk:** privacy/ToS/infra (real).

### Public API + outbound webhooks — ⚠ scope-creep trap
- **What:** A documented token API + webhooks (Zapier/Make surface).
- **Why it's a trap:** Platform mirage — needs scoped tokens, rate limiting,
  versioning, docs, a webhook dispatcher (SSRF/replay risk), all server-side. High
  build+maintenance for a power-user base that doesn't exist. Fake-door first.
- **Effort:** L · **Risk:** security/privacy (token + webhook surface).

---

## 7. AI & automation

> Note: CLAUDE.md §5 currently lists AI features under DO-NOT-BUILD-YET. The
> insight below: **the highest-value "AI" here isn't AI at all** — it's
> deterministic math over data Todonado already owns, which keeps task text in
> the DB (no 3rd-party model, no per-token cost) and is unit-testable like the
> existing roll-over logic.

### Auto-plan-my-day against capacity (deterministic) — ▲ high-leverage
- **What:** One Today button: pull unscheduled + rolled-over tasks, rank by
  priority/due/age, and pack `scheduled_for = today` up to capacity using
  `effort_minutes`, stopping exactly at the overbooking line. Editable proposal,
  never auto-commits.
- **Why it fits:** This *is* the capacity core as automation — a greedy/knapsack
  fill reusing `daily_capacity_minutes`, `effort_minutes`, `scheduled_for`, and
  the overbooking guard. Deterministic and unit-testable; no LLM. "Realistic day"
  in one tap.
- **Effort:** M · **Risk:** low · **EV:** Very high — best demo moment and the
  most defensible "AI" marketing claim despite being plain logic.
- **Depends on:** auto-effort-estimate (so unestimated tasks can still be packed).

### Statistical auto-effort-estimate (no-LLM) — ▲ high-leverage
- **What:** When a task is added without an estimate, suggest one from the user's
  own history (median `actual_seconds` + prior `effort_minutes` for similar
  tasks, same project/section). One accept/adjust chip.
- **Why it fits:** Feeds the wedge's key input. The #1 reason planning fails is
  missing/garbage estimates; the signal already exists locally as quantile math
  over RLS-scoped rows. No LLM, no text leaves the DB, zero cost.
- **Effort:** M · **Risk:** low · **EV:** High; compounds with focus history.
- **Depends on:** enough focus/task history (cold-start → project/global medians).

### Adaptive capacity calibration (auto-tune `daily_capacity_minutes`) — ▲ high-leverage
- **What:** Compare planned vs completed effort over a rolling window and nudge:
  "You complete ~280 min/day, not 360 — lower your capacity?" One-tap accept.
- **Why it fits:** Makes the single most important wedge parameter
  self-correcting instead of a guessed onboarding number. Deterministic rolling
  aggregate; reinforces "honest about capacity" better than anything here.
- **Effort:** S · **Risk:** low · **EV:** High value per effort.

### Weekly review summary — ⏳ needs real users first
- **What:** A Monday digest: plan-vs-actual, estimation bias, top roll-overs,
  focus trends, with "tighten capacity to N" suggestions.
- **Why it fits:** The data-grounded fill for the empty Insights page; computable
  from existing data with SQL (LLM optional for prose narration only). Closes the
  calibration loop — but needs multiple weeks of data.
- **Effort:** M · **Risk:** low (high only if narrated via an LLM).

### Natural-language quick capture (LLM) — ⏳ needs real users first
- **What:** "Email investor deck ~45m tomorrow p2 #Fundraising" → extracted
  title/effort/date/priority/project, confirm before save.
- **Why it fits:** Maps 1:1 to `NewTaskInput`, but crosses the privacy line (task
  text → 3rd-party model) + per-call cost; must be a server-side Edge Function,
  never a client key. **A regex/`date-fns` lite-parser (`~45m`, `p2`, `tomorrow`,
  `#Project`) captures ~70% of the value at near-zero cost/risk** — the honest
  first step. Validate LLM demand via fake-door.
- **Effort:** L · **Risk:** privacy + cost.

### Conversational agent over your tasks — ⚠ scope-creep trap
- **What:** A chat box to "reschedule this week into next," "what first?", etc.
- **Why it's a trap:** Generic LLM-chat-over-data that every app is bolting on;
  doesn't deepen the wedge. High build cost (agent loop, RLS-safe tools, evals) +
  recurring cost + full-corpus privacy exposure — while the deterministic
  auto-plan/auto-estimate features deliver ~80% of the outcomes with none of it.
- **Effort:** L · **Risk:** privacy + cost + agent-safety.

---

## If I could only build 3 next

The shortlist optimizes for **deepening the wedge with buildable-now, low-risk,
compounding work** — and deliberately avoids anything gated on a user base or
new infra.

### 1. Make the wedge self-improving — *auto-effort-estimate + adaptive capacity calibration*
The capacity meter is only as honest as its two inputs: per-task `effort_minutes`
and `daily_capacity_minutes`. Both are currently guesses. Auto-estimate (M) seeds
effort from the user's own focus actuals; adaptive calibration (S) auto-tunes
daily capacity from completed-vs-planned. Together (deterministic, no LLM, no new
external surface) they make the *entire differentiator get smarter every day the
app is used* — the strongest possible retention and "it just works" story, and a
prerequisite for everything else.

### 2. Auto-plan-my-day (deterministic greedy scheduler)
The single highest-EV feature in this doc. It converts the meter from a passive
warning into an *active assistant* — one tap turns a pile of tasks into a day that
fits capacity, stopping exactly at the overbooking line. It reuses every existing
selector, is unit-testable like roll-over, ships with no AI/infra, and is the best
demo moment Todonado has. Pairs naturally with #1 (better estimates → better auto-
plans).

### 3. Calendar busy-import — ICS-first, then OAuth
The most credible proof of "honest about capacity": the meter stops assuming your
whole day is task-available and reflects the meetings you've already committed to.
Ship the **ICS-URL slice first (M, no OAuth/app-review)** to validate demand and
deliver the core value, then add Google OAuth (L) behind a server-side token
holder. It's the one sanctioned integration and the only one that lands directly
in the capacity core.

**Honorable mention — Week view (M, low risk):** extends "realistic day" to
"realistic week" almost entirely over existing pure logic. If the three above feel
too estimate-heavy, swap it in for #3 as the lowest-risk wedge extension.

**Cheapest high-leverage bet of all — the collaboration fake-door (S):** if you're
unsure whether to invest in *any* V2 theme (collaboration, Slack/email capture,
public API), spend a day wiring `feature_intents` buttons and let real demand —
not this doc — decide the next L-effort bet.
