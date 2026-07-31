# CLAUDE.md — Todonado

> Guidance for Claude (and humans) working in this repo. Read this first, every session.

---

## 1. Product thesis

**Capture everything. Plan a realistic day. Execute with focus. Recover intelligently.**

Todonado is a **daily command center** — a dark, mission-control workspace for getting the
right things done each day. It is **NOT** "another to-do list." A to-do list hoards tasks;
Todonado helps you commit to a *realistic* day, protect your focus, and recover gracefully
when plans slip.

### Positioning
- **Command center, not a list.** The home screen is **Today** — a cockpit, not an inbox.
- **Honest about capacity.** We refuse to pretend a 14-hour day fits in 8 hours.
- **Recovery over guilt.** Unfinished work rolls over intelligently; the user stays in control.

### The one differentiator (MVP)
**Effort-aware Today planning.** Every task can carry an `effort_minutes` estimate. The
**Today capacity meter** sums the effort of what you've scheduled for the day against your
daily capacity and warns before you overcommit — paired with lightweight **task roll-over /
recovery** for what didn't get done. This is the wedge. Protect it; build around it.

---

## 2. Design system (LOCKED — do not improvise other colors)

Dark mode is the **default and only** theme for now. Tokens live in `tailwind.config.js`
and the base layer in `src/index.css`. Use the Tailwind utilities — never hardcode hex in
components.

### Colors

| Token            | Hex       | Tailwind utility (bg/text/border)        |
| ---------------- | --------- | ---------------------------------------- |
| background       | `#0A0D16` | `bg-background`                          |
| surface / panel  | `#0F172A` | `bg-surface`                             |
| surface-2        | `#1E293B` | `bg-surface-2`                           |
| brand (violet)   | `#6C5CE7` | `bg-brand` / `text-brand` / `ring-brand` |
| accent (blue)    | `#4EA8FF` | `text-accent` / `bg-accent`              |
| success (mint)   | `#22D3A6` | `text-success`                           |
| warning (amber)  | `#F59E0B` | `text-warning`                           |
| danger (coral)   | `#F43F5E` | `text-danger`                            |
| text-primary     | `#F8FAFC` | `text-text-primary`                      |
| text-muted       | `#94A3B8` | `text-text-muted`                        |

### Fonts
- **Display / headings:** Poppins (600/700) → `font-display`
- **UI / body:** Inter (400/500/600) → `font-sans` (default)
- **Mono (timers, metrics, durations):** IBM Plex Mono → `font-mono`

Loaded via Google Fonts in `index.html`.

### Visual language
- **Card radius:** `rounded-2xl` (1rem). Raised radius `rounded-3xl` (1.5rem).
- **Elevation:** `shadow-elevation` / `shadow-elevation-lg` (soft, dark-friendly).
- **Brand gradient (violet → blue):** `bg-brand-gradient` for primary CTAs;
  `bg-brand-gradient-soft` for active nav / subtle fills; `text-gradient-brand` for gradient text.
- **Focus ring:** apply `.focus-ring` (brand ring + offset) to interactive elements.

### Primitives
Four base primitives in `src/components/ui/` — **compose these, don't reinvent**:
`Button`, `Card` (+ `CardHeader/Title/Description/Content/Footer`), `Input`, `Badge`.
The brandmark is `src/components/brand/Logo.tsx`.

---

## 3. Architecture & conventions

### Stack (locked)
Vite + React 18 + **TypeScript (strict)** · Tailwind v3 · Supabase JS (auth + Postgres +
RLS + realtime) · **TanStack Query** (all server state) · React Router v6 · Zod · date-fns ·
lucide-react.

### Folder layout (feature-based)
```
src/
  components/
    ui/        # design-system primitives (Button, Card, Input, Badge)
    layout/    # AppShell, Sidebar, TopBar, nav config
    brand/     # Logo
    common/    # cross-feature bits (loaders, placeholders)
  features/
    auth/      # AuthProvider, auth-context, ProtectedRoute, LoginPage
    today/     # TodayPage (command center), CapacityMeter, streak, digest, autoPlan
    week/      # /week 7-day capacity board + "Plan my week" (FEATURES.week, Pro)
    inbox/ projects/ insights/          # feature pages
    focus/     # Focus Mode + the Pomodoro cadence (FEATURES.pomodoro)
    work/      # "Get to Work" — /work, one tap from wanting to start to starting
    vision/    # /vision — the goals behind the work (FEATURES.vision)
    points/    # derived score + level bands (FEATURES.points) — no table
    share/     # the canvas share card (FEATURES.shareCards) — drawn on-device
    hub/       # /hub — every door on one screen (FEATURES.hub), additive to Today
    templates/ # catalog (built-in) + personal (user_templates), one shared apply path
    history/   # the Free rolling history window (view-layer only)
    calendar/  # .ics parsing + busy-minutes → capacity (FEATURES.calendarImport)
    billing/   # usePlan / planCore — the ONLY entitlement source
    settings/ marketing/ legal/ analytics/ onboarding/ auth/ workspace/
    wellness/  # "Focus & Calm" suite — breathwork/ audio/ tracker/ quit/ + /wellness hub (FEATURES.wellness)
  lib/         # supabase, env, queryClient, queryKeys, config (FEATURES + caps), utils
  routes/      # AppRoutes
  types/       # database row types
api/           # Vercel serverless functions (Stripe checkout/portal/webhook, calendar proxy)
  _lib/        # shared: ssrf guard, http, supabase service client, entitlement
supabase/
  migrations/  # SQL: schema, RLS, auth bootstrap
docs/          # PRD, ROADMAP, SUPERAPP_ROADMAP, audits, billing + launch runbooks
```
Group by **feature**, not by file-type. A feature owns its components, hooks, and queries.

### Coding rules
- **TypeScript strict.** No `any` escape hatches without a comment justifying it. Prefer
  precise types from `src/types/database.ts`.
- **TanStack Query for ALL server state.** Never store server data in ad-hoc `useState` or
  context. Mutations invalidate the relevant query keys. The shared client is
  `src/lib/queryClient.ts`.
- **RLS-first data model.** Security lives in the database. Every table has RLS; the client
  is assumed hostile. Never rely on client-side filtering for authorization.
- **No secrets in code.** Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public anon
  key) reach the browser. Both ship as built-in defaults in `src/lib/env.ts` so a fresh clone
  runs with no `.env`; the anon key is public (RLS-protected) and safe in the client bundle. A
  real `.env` (gitignored) still overrides. Never commit `.env`; never hardcode the
  **service_role** key or any other secret.
- **Path alias:** import from `@/…` (maps to `src/`).
- **Design tokens only.** No raw hex in components — use the Tailwind tokens above.
- **Accessibility:** label controls, mark decorative icons `aria-hidden`, keep focus rings.

> **Golden rule:** Use established, battle-tested patterns for auth, RLS, realtime sync,
> theming, and TanStack Query — **don't invent novel approaches for solved problems.**

### Verify before you commit
`npm run typecheck` · `npm run lint` · `npm run test` · `npm run build` must all pass. Pure
logic (capacity, roll-over selection, selectors, reorder) is unit-tested with Vitest — keep
it that way. `npm run e2e` runs the Playwright browser smoke (a real browser against the live
cloud DB — see §7). Commit in small, logical commits. **Every push to `main` is also verified in
GitHub Actions CI** (§7), so a green push is validated even when local gates are skipped.

### What's built (state)
Phase 0 (foundation) and the **MVP task engine** are done: workspace context, full task CRUD
with optimistic TanStack Query hooks, **Inbox** capture, **Projects** (sections, tasks,
expandable subtasks, drag-reorder), the **Today** command center with a live **effort-aware
capacity meter** + overbooking guard, lightweight **roll-over** (with undo), Supabase realtime
sync (flagged in `src/lib/config.ts`), and `npm run seed`. **Focus Mode** is built: task-bound
focus sessions with a drift-resistant, refresh-proof timer (elapsed derived from timestamps +
accumulated pause), pause/resume, interruption logging, a calm circular-timer UI, and a
recorded session summary (`focus_sessions` table; accumulated focus time shows on task rows).
**Recurring tasks** are built: daily/weekly(weekday picker)/monthly/yearly with an "every N"
interval + optional end date (recurrence columns on `tasks`); completing a recurring task keeps
it in history and spawns the correctly-dated next occurrence (unit-tested date math incl.
month-end clamp). **First-run onboarding** is built: a short, skippable 4-step activation flow
(welcome → daily capacity → capture → plan today) that reuses existing capacity/quick-add/
scheduling logic to land a new user on a planned Today with a live capacity meter; gated by
`profiles.onboarding_completed`, never re-shown once finished/skipped. **Insights** is **built**
(Pro) — planned-vs-actual effort, roll-over patterns and focus trends; §4 has said so since it
shipped, and this line claimed the opposite until the 2026-07-31 truth pass caught it.
`src/components/common/PagePlaceholder.tsx` — the component that served that era — is deleted.

The **wellness suite ("Focus & Calm")** is built behind a single feature flag,
`FEATURES.wellness` in `src/lib/config.ts` (default **ON** for signed-in users). Flip it off to
remove the whole suite — the Wellness nav entry, every `/wellness` route, and the hub — with
**zero** impact on the core (Today/Inbox/Projects/Focus/Insights). It all lives under
`src/features/wellness/`: a `/wellness` hub (`modules.ts` registry — live modules link to their
page; any module still marked `'soon'` falls back to the insert-only `feature_intents` fake-door
card). Modules:
- **Breathwork** (`wellness/breathwork/`) — an animated breathing pacer with Box (4-4-4-4), Calm
  (4-7-8), and Simple (4-4) patterns and 1/3/5-min durations. The phase + circle are derived from
  wall-clock elapsed (mirroring the Focus timer's drift-resistant approach, ms precision via rAF),
  with pause/resume and a calm rounds-completed summary. Optional end chime **reuses** the Focus
  AudioContext chime (`playEndTone` from `@/features/focus/sound`). No audio files, no DB.
- **Sleep sounds + Guided meditation** (`wellness/audio/`) — ONE reusable `<AudioPlayer>`
  (play/pause, loop, volume, sleep-timer auto-stop) shared by both sections, driven by a
  `tracks.ts` manifest (`id, title, description, category 'sleep'|'meditation', src?, durationSec?,
  generator?`). **Sleep NOISE ships and plays** (2026-07-31, §11): white, pink and brown are
  generated on the device, so a track is playable when it has a `src` **or** a `generator`
  (`isTrackPlayable`). **NO copyrighted audio is bundled**: every RECORDED track still ships with
  empty `src` and shows an "Audio coming soon" state until licensed/CC0 files are dropped in
  `public/audio/` (served at `/audio/…`) or pointed at a Supabase Storage URL — see
  `public/audio/README.md`.
- **Supplement / medication tracker** (`wellness/tracker/`) — owner-only CRUD over `wellness_items`
  + `wellness_logs` (TanStack Query, optimistic, mirrors `useTaskMutations`): add/edit/delete,
  mark-taken-today, taken-streak (pure `tracking.ts`, unit-tested), and recent activity. A
  **PERSONAL LOG ONLY** — no drug database, interaction/contraindication checks, or dosing logic;
  `dose`/`schedule` are free text — with a persistent, non-dismissible "not medical advice"
  disclaimer.
- **Quit tracker** (`wellness/quit/`, `FEATURES.quitTracker`, default **ON**) — habits the user is
  **breaking**, at `/wellness/quit`. The tracker above records what you *take*; this records what
  you are deliberately *not doing*. **Day zero is a timestamp, never a counter**: the clean streak
  is derived from `quit_habits.quit_started_at` on every render (the Focus timer's discipline), so
  it cannot drift, needs no daily job, and *grows* while the app is closed. A slip is one UPDATE —
  move day zero to now and raise `longest_streak_days` to the run just completed if it beat the
  record. That number is the only denormalised value and **only ever goes up**, so a reset can
  never erase what someone already proved they could do. Whole days are counted by **local
  calendar-day** arithmetic (DST-safe), so the headline ("day 1") and the live clock ("2h 14m") can
  differ by one within a day — deliberately. Presets are clinically neutral by rule (see the naming
  rule atop `presets.ts`): no "bad habit", no warning-label iconography, nothing a user would be
  embarrassed to see on their own screen. Check-ins (`quit_checkins`, UNIQUE per habit+day) are an
  **optional** affirmation and never gate the streak — forgetting to open the app is not a relapse.
  The **replacement action** ("do this instead", free text, optionally deep-linking to breathwork or
  Focus) is surfaced on the card, inside the slip dialog, and again immediately *after* the reset,
  which is the moment it exists for. Milestones 1/3/7/14/30/90/180/365 are marked calmly — no
  confetti. Free tracks `FREE_QUIT_HABITS = 1`; the cap gates **creation only** and the copy says
  so. A persistent, neutral (not amber, not alarming) note states plainly that this is a personal
  tracker, not treatment. Its migration is **applied** (§7).

A read-only **fake-door teaser** for Focus & Calm also lives on the `/welcome` marketing page
(records `feature_intents`); it is independent of `FEATURES.wellness`.

### Shipped in the 2026-07-28 session (six features)

All six are live on `main`. Each is behind the repo's usual conventions: a flag in
`src/lib/config.ts` where it is an optional surface, a single tunable constant where it is a
plan limit, `usePlan()` as the only entitlement source, and pure logic unit-tested.

1. **Free history window** (`FREE_HISTORY_DAYS = 14`, `src/features/history/`). A **view-layer**
   limit only — nothing is deleted, archived or mutated, and there is no migration.
   `windowTaskHistory(tasks, null)` returns the *same array reference* for Pro, so upgrading
   reveals everything on the next render with no refetch. 14 calendar days **counting today**,
   compared on local day strings (DST-safe, verified in six timezones). Applies **only** to
   completed/history surfaces (project detail + the Today streak); Today, Inbox, roll-over,
   capacity, auto-plan, templates and calendar are deliberately untouched, and an **open** task
   is never hidden at any age. One quiet `HistoryCutoffCard` at the bottom, rendering nothing
   when `hiddenCount` is 0.
2. **Live calendar URL sync (Pro)** — `api/calendar-fetch.ts` + `api/_lib/ssrf.ts`. URL
   subscribe used to be fetched from the browser and was CORS-blocked in practice; it is now
   fetched **server-side**. The endpoint verifies the caller's Supabase JWT, gates on Pro
   **server-side** via `resolveServerPlan` (ignores the localStorage override), and **ignores the
   request body entirely** — URLs come only from the caller's own `calendar_sources` rows, so it
   can never be an open proxy. Full SSRF guard: scheme/port allow-lists, no embedded credentials,
   DNS resolved and every address checked against private ranges before a socket opens, redirects
   followed manually and re-validated per hop, 10s timeout, streaming byte cap; every rejection
   reason collapses to `invalid_source`. Free keeps `.ics` **file** upload fully functional;
   existing Free URL sources are kept and badged "Paused", never deleted. `planCore.ts` holds the
   plan type + `resolveEffectivePlan` as a leaf module both the client and the serverless
   functions import, so the two gates cannot disagree. `vite.config.ts` now serves `api/*.ts` in
   dev/preview. No migration ("last refreshed" comes from TanStack's `dataUpdatedAt`).
3. **Smart Daily Digest** (`FEATURES.digest`, `src/features/today/digest.ts` +
   `components/DailyDigest.tsx`). A dismissible "Start your day" briefing at the top of Today.
   **Composition, not a new engine** — every number arrives already computed by the feature that
   owns it (`streak`, `selectRolloverTasks` + `rolloverSpan`, `withCalendar`, `planDay`,
   `estimationBias`), so it can never disagree with the meter beneath it, and it adds **zero**
   network requests. Free gets greeting/streak/carried-over/meetings/capacity + the existing
   plan preview; Pro adds a pre-computed plan with Accept/Adjust, an estimation nudge and
   priority alerts. Dismissal is stored as the local **day** it was dismissed on (localStorage),
   so it returns tomorrow by itself. No migration, no new analytics event.
4. **Personal templates** (`FREE_PERSONAL_TEMPLATES = 3`, `src/features/templates/personal.ts`,
   table `user_templates`). Users save their own routines — or capture a whole project via
   "Save as template", preserving section grouping, section order, task order, effort and notes
   (completed/cancelled work excluded; an unestimated task gets the neutral 30m fallback, never
   0). **One system, not a fork:** `personalToTemplate` adapts a stored row into the catalog's
   `Template` at a single boundary, so the card, search, preview, apply path, toasts and undo are
   the existing code and `/templates/:id` resolves catalog slugs and personal uuids with no
   collision. The cap gates **creation only** — everything already saved keeps applying forever.
   `personalCaps.test.ts` reads the migration and asserts each client cap equals its DB CHECK, so
   the two can't drift.
5. **Week view (Pro)** (`FEATURES.week`, `src/features/week/`). `/week` shows the next 7 days,
   each with its **own** capacity meter (calendar-aware via `busyMinutesByDate`, which parses each
   calendar once and routes every date through the same `busyMinutesForDay`, so `/week` and
   `/today` can never disagree). Tasks drag between days — a drag changes **only** `scheduled_for`
   and is undoable. Unscheduled tasks deliberately do **not** appear (Inbox stays their single
   home); overdue work surfaces in today's column under its own heading and is **not** counted in
   today's capacity. Free sees a clearly labelled **sample** week — never their own data blurred
   behind a scrim. Compact `WeekTaskCard`/`WeekQuickAdd` presentations over the **same** mutations
   (TaskRow/QuickAdd don't survive a seventh of the screen); keyboard-movable via dnd-kit's
   `KeyboardSensor`. No migration.
6. **"Plan my week"** (`src/features/week/planWeek.ts`). One tap distributes eligible work across
   the 7 days, never overcommitting one. Eligibility is `planDay`'s proven rule widened to seven
   days: an open task qualifies when it is not already scheduled for today-or-later **and** is
   project-less, overdue, or deadlined inside the window — a project task with no deadline is
   deliberately left alone. Candidates are sorted once (priority → due → effort → id) and placed
   on the **earliest day with room**, where room already charges unestimated existing work the
   planner's assumed cost so a second run can't double-book. A task is never placed **after its
   own due date** — it is skipped and reported instead. Same preview/confirm contract as
   `PlanMyDay`; Accept snapshots every task's previous date so one Undo restores the whole week.
   No migration.

### Shipped in the 2026-07-30 session

1. **Quit tracker** — see the wellness-suite list above. Its migration is **APPLIED** (§7).
2. **"Get to Work" + Pomodoro** (`FEATURES.getToWork`, `FEATURES.pomodoro`, both default **ON**).
   `/work` is composition only: it ranks what is already in the cache (`work/pickWork.ts` — resume
   what's in progress → overdue → planned for today → backlog, tie-broken by the same
   priority→due→effort→position order `planWeek` uses, so two surfaces can't disagree), optionally
   runs the **existing** breathwork pacer for 60 seconds, and hands off to `/focus?task=…&pomodoro=1`.
   It starts no timer and owns no data.
   **Pomodoro is one `focus_sessions` row per work interval, with the break as device-local UI
   state — and that is the whole design decision.** The obvious alternative (one long row whose
   elapsed time contains the breaks) silently corrupts everything downstream: `focusStats` sums
   `actual_seconds` for every finished row, so break minutes would be reported as focus minutes in
   Insights, the weekly review, `estimationBias` and every task's focus total — and `isComplete`
   would have to mean two things at once. One row per interval means a 4-pomodoro chain simply *is*
   four completed 25-minute sessions, so every existing number stays true with **no migration, no
   new column, and no change to what `actual_seconds` means**. A break is not work, so it is not a
   row either — recording one would make a skipped break an *abandoned session* and drag the
   completion rate down. The break clock is still **timestamp-derived, never tick-counted**, so it
   survives a reload, a locked phone and a throttled tab. The cadence is a single frozen preset
   (25/5, 15 after every 4) because `docs/SUPERAPP_ROADMAP.md` flags pomodoro presets as a
   scope-creep trap; 25/50/90 + custom sprints are untouched. `RunningView` now reports **why** a
   session ended (`'finished'` vs `'stopped'`) because `endStatusFor` records anything over a minute
   as `completed` even when stopped early — the status alone would over-count pomodoros. "Pomodoros
   today" is counted off the session rows, never from a stored tally, so it survives a cleared
   localStorage and a different device. The pacer moved to `breathwork/BreathPacer.tsx` (a pure
   move, byte-identical) so a short breathing step can be embedded without pulling the
   `/wellness/breathe` route chunk along; it stays gated by `FEATURES.wellness` so switching the
   suite off really removes it. Guided-meditation **audio** remains honestly "coming soon"
   (licensing) — unchanged. No migration.
3. **Checklists + Vision** (`FEATURES.vision`, default **ON**).
   **Checklists are templates, not a second system.** `Template.style` is one OPTIONAL field —
   absent means `'plan'`, which is what every template, every stored row and every fixture already
   was, so nothing needed changing. `'checklist'` means a repeated-use list applied WITHOUT dates,
   so `applyTargetsFor()` drops the dated target for it **and** `applyTemplate` normalises a dated
   request away, keeping the invariant true for any caller and the reported destination truthful
   rather than claiming "Today" for undated tasks. Eight new built-ins under a 13th category,
   **Routines & Checklists** (a PPL gym split ×3, morning pages, weekly + evening shutdown,
   carry-on packing, kitchen deep clean) — still effort-tagged, because a checklist is not an
   excuse to drop the differentiator. Personal templates persist it in a new **nullable** `style`
   column; `toTemplateStyle()` reads null *and anything unrecognised* as `'plan'`, so a value from
   a future build can never make a saved template unusable, and the write path only NAMES the
   column when a checklist is actually being saved (falling back, and saying so, if it isn't there
   yet) — which is what makes the migration safe in both deploy directions.
   **Vision** (`vision_cards`) is the goals behind the work: title + why + optional target date,
   dnd-kit reorderable through the SAME `SortableList` + single fractional `position` write every
   other list uses, optionally linked to the project that serves it. That link is **guarded in
   RLS**, not merely nullable — this table is user-scoped while `projects` are workspace-scoped, so
   both write policies also require `can_access_project(project_id)` — and a deleted project
   **unlinks** rather than cascading, because losing someone's goal over an archived project would
   be indefensible. Text-first on purpose: images mean a storage bucket, upload limits, a storage
   policy and a bill, so one `feature_intents` chip measures the demand before any of that is
   built. A target date that passes is *stated*, never scolded — no red, no "overdue" — because a
   goal is not a task. `FREE_VISION_CARDS = 3`, creation-gated only. Three migrations, all **APPLIED** (§7).
4. **Points, share cards, invite groundwork, sound settings** (`FEATURES.points`,
   `FEATURES.shareCards`, both default **ON**). **No migration, no table, no column.**
   **Points are DERIVED, never stored** — recomputed from the tasks and focus sessions already in
   cache, exactly like the streak, so they cannot drift and a corrected task instantly corrects the
   score. Three decisions worth keeping: (a) it is a **rolling `POINTS_WINDOW_DAYS` window**, the
   same one Insights' summary uses, so Today and Insights are two views of ONE computation — a
   lifetime total would have grown forever regardless of this week AND would have had to be
   history-windowed for Free, making a Free user's score visibly *fall*; (b) it counts **only what
   every surface already has** (tasks + focus sessions) — check-ins would have meant either a new
   fetch on Today or two surfaces disagreeing; (c) levels are **bands, not numbers**, because a
   rolling score would have to demote you after a quiet week and "you dropped to level 4" is
   exactly the shaming this app refuses. Effort points are capped per task so the number cannot be
   farmed by typing a bigger estimate. All weights live in `POINT_WEIGHTS`.
   **Share cards** are drawn on a canvas in the page — no upload, no server, no image service. What
   they can contain is exhaustive: one number, one caption, an optional FIRST name (never an
   email-shaped one), and the wordmark. The quit card is passed `days` and **not** `habit.name` —
   the habit is the one thing somebody would be mortified to post, so it is never passed in rather
   than passed and carefully not drawn. A preview is always shown before anything is shared.
   **Sounds & notices** (Settings) is device-local (`settings/prefs.ts`, localStorage): which
   machine may make a noise is a property of the machine, not the account. `playEndTone()` keeps
   its exact signature and now reads the tone/volume/master-switch from that store, so every
   existing caller (focus, pomodoro breaks, breathwork) obeys the setting with no call-site change.
   The three chimes are **synthesised** — no audio files, nothing to license. Push and email
   reminders are NOT built, and there is no switch pretending otherwise.
   **Invite** offers a plain copyable link that works today and an interest chip for referral
   rewards — no fake code, no invented credit balance, no "invite 3 to unlock" that could never pay
   out. `InterestChip` shows a FAILURE when the insert is rejected, never a thank-you.
5. **The Hub** (`FEATURES.hub`, default **ON**). **No migration.** `/hub` is a grid of every
   destination, for the moment you know you want to *do* something but not which part of the app
   does it. **ADDITIVE, NEVER A REPLACEMENT**: Today is still what `/` shows, every destination is
   still reachable exactly as before, and moving your start screen to the Hub is one explicit
   choice in Settings — the first-run flow that is known to work is left alone. When it IS moved,
   `/` **redirects** rather than rendering the Hub at `/`, so the URL always says where you are.
   The tile list is pure data (`hub/hubTiles.ts`) and each tile is gated by the SAME flag as its
   route, because a tile pointing at an unmounted route would hit the catch-all `<Route path="*">`
   and silently drop the user on Today with no error. `hubTiles.test.ts` pins tile → mounted route
   statically and `e2e/hub.spec.ts` clicks **every** live tile and asserts the destination.
   Two tiles deep-link rather than inventing a page: "Build my day" opens Today with the planner's
   preview already up (`/?plan=1`, a `defaultOpen` prop on the existing `PlanMyDay`), and
   "Checklists" opens the filtered catalog (`/templates?category=checklists`). "Journal" was
   originally a **button, not a link** — it navigated nowhere and explained that a journal worth
   building needed a service the app did not have. It became a real link when the journal shipped.
   In the nav it sits at the **top of the desktop sidebar** but is deliberately NOT `primary`: the
   mobile bottom bar's four primary slots + More already fill its documented five, so on mobile it
   lives in the More sheet.
   **`/` is a redirect, not a page.** It resolves to `/today` (or `/hub`), and Today has its own
   path. That is not cosmetic: while `/` rendered Today directly and only redirected for hub users,
   every control pointing at `/` — the Today nav item, the Hub's own Today and Build-my-day tiles,
   the Week header's Today button — silently bounced a hub-start user back to the Hub, making Today
   **unreachable**. One canonical path per screen is what closes that whole class of bug, and
   `e2e/hub.spec.ts` now reaches Today by three separate routes with the preference on.
   The landing strip now states breadth as a fact ("Your day, your focus, your habits — one place
   … Not five apps stitched together") with **no named competitors and no "replaces N apps"** — the
   list under it is the claim. The Quit tracker and Vision are deliberately **absent from that
   list** until their migrations are applied, because a visitor who signed up today would find a
   "not switched on yet" page; the exact two lines to add afterwards are written in the file.

6. **Living landing + content truth-pass** (`marketing/`). The landing gained an ambient
   `LivingBackground` — a three-colour aurora on three parallax planes, grain, and drifting dust,
   all CSS keyframes the compositor owns. **The rule it encodes: never blur a layer that moves.**
   The first version blurred each blob at 80px and scrolling fell from 60fps to 21 (production
   build, 390px, unthrottled) because a blurred surface re-rasterises whenever it moves; the
   softness now comes from the gradient's own alpha falloff, nothing scales, and it is back to 60fps
   at 1x/4x/6x CPU. `+1.65 kB gz` total, no new dependency, and `e2e/landing.spec.ts` asserts
   `filter: none` so it cannot regress quietly. It parks on `visibilitychange` and, under
   `prefers-reduced-motion`, keeps the whole composition but stops every moving part.
   The **content truth-pass** corrected the pricing split, which had drifted badly: Pro claimed the
   capacity meter, the overbooking guard, roll-over, focus mode and recurring tasks — **all five are
   free and always were** — while Free was described as "a basic Today list with manual scheduling".
   Every Pro bullet is now a real `usePlan()` gate (week, Insights, unlimited history, live calendar
   sync, the smart-briefing layer, the unlimited caps) and nothing else. `/pricing`'s "roadmap" had
   listed two things that already shipped; it is now a **what-isn't-built** list where each entry
   names its real blocker. New `OnePlaceStrip` states the breadth by grouping shipped surfaces
   (plan · focus · habits · calm · reflect) with real links, and a `WeekBoardDemo` (2.34 kB gz,
   lazy) puts the flagship paid feature on the landing by running the REAL `planWeek` — which is
   importable without dnd-kit because `planWeek.ts` and `week.ts` are pure.
   `e2e/marketing.spec.ts` pins the rule that matters: **no shipped feature may be labelled unbuilt.**

### Shipped in the 2026-07-31 session

7. **Mind maps** (`FEATURES.mindMaps`, `src/features/mindmaps/`, `/vision/maps`). A canvas of
   draggable ideas joined by lines — the stage BEFORE a task list, where the thought is still
   branching. Hand-rolled SVG and pointer events: react-flow is ~50 kB gz and d3-force more
   again, and neither is needed to draw boxes and straight lines with no automatic layout.
   **ONE ROW PER MAP, GRAPH IN JSONB**, and that is the design decision the rest follows from.
   Node/edge tables would make a drag an UPDATE, an open three round trips that can arrive out of
   order, and an undo a transaction — for data only ever read and written AS A WHOLE by one owner.
   The price is that the database cannot enforce the graph's internal shape, so `normaliseMap`
   parses both columns defensively on every read and DROPS what it cannot understand (duplicate
   ids, edges to missing nodes, NaN coordinates, a second root) rather than throwing: a map that
   opens with one node missing is recoverable, a page that crashes on load is not.
   The one part of that gap that is security rather than tidiness IS closed in SQL —
   `mind_map_links_ok` walks the nodes and requires `can_access_project` / `can_access_task` for
   every link, on both write paths, because this table is user-scoped while both link targets are
   workspace-scoped and owner-only RLS alone would let a client park an id it cannot read.
   **The editor owns the graph while it is open** (`staleTime: Infinity`, no refetch on focus) —
   the opposite of the app's usual TanStack-owns-server-state rule, because a drag outruns any
   round trip. Saving is debounced 900 ms and flushed on unmount, on `visibilitychange`, and on
   `pagehide` via a **keepalive** write — the last is what makes a RELOAD safe, since it kills both
   the pending timer and any request in flight.
   Two things the screenshots caught that the tests had not: ring placement was checking occupancy
   against 0.75 × the node box, so "not taken" and "not overlapping" were different questions and
   boxes drew through each other; and fitting a map into 390 px lands at ~35 %, where every label is
   a smudge — so `openingView` fits only while the result stays readable and otherwise opens at a
   readable floor centred on the root. **The Fit button still always means fit.**
   Accessibility is not the canvas's problem alone: every node is a focusable button (arrows move,
   Enter opens, Delete removes) AND the page renders the same map as a plain list with the same
   actions, so nothing depends on pointing at SVG. `FREE_MIND_MAPS = 1`, creation-gated only.
   One migration, **APPLIED** (§7). `e2e/mindmaps.spec.ts` additionally runs the whole journey against
   an INTERCEPTED table, because the real journey self-skips until the migration lands and a
   skipping test verifies nothing at all.

8. **Challenges** (`FEATURES.challenges`, `src/features/challenges/`, `/challenges`). A short,
   structured push you opt into — nine to ten built-ins spanning what already ships.
   **PROGRESS IS DERIVED, AND THE TABLE HAS NO PROGRESS COLUMN.** Every bar is recomputed on
   render from tasks, focus sessions, quit habits and journal days — the same discipline as the
   planning streak and the points score. A stored counter would drift the first time a task was
   un-completed or a date corrected, and the only way back would be a repair script; derived
   progress has nothing to drift from. `challengeMigration.test.ts` asserts the absence of any
   `progress` / `count` / `streak` / `total` column, because that is exactly the "optimisation"
   a future session would reach for.
   The constraint that a challenge may only measure data that already exists is what keeps the
   feature from growing tracking machinery of its own — and it is why there is no meditation
   challenge: breathwork is deliberately device-local with no table.
   **NON-SHAMING BY CONSTRUCTION**, and each piece is load-bearing: `elapsedDays` counts only days
   that have HAPPENED, so day one of seven reads "1 of 7" rather than "1 of 7, 6 missed"; a window
   that runs out is `ended` (never "failed") and the row is never rewritten to say abandoned just
   because time passed; and the Free cap counts only RUNNING attempts, so a finished or lapsed one
   never blocks a new one. `started_at` is a DATE and part of `UNIQUE (user_id, challenge_key,
   started_at)`, so a double-tap is one attempt while a genuine restart tomorrow stays legal — and
   the client treats 23505 as success rather than surfacing a scary error for a button that did
   what was asked. `challenge_key` deliberately has **no** CHECK: the catalog is client content
   that will grow, and an unknown key is handled kindly in the client instead.
   The completion share card carries the challenge's LENGTH and never which challenge it was —
   the same rule as the quit card, and for the same reason: one of them counts clean days.
   `FREE_ACTIVE_CHALLENGES = 1`. One migration, **APPLIED** (§7). `e2e/challenges.spec.ts` seeds REAL
   tasks over REST and asserts the bars against them, so if progress ever started being stored the
   numbers would stop matching the work behind them.

9. **Daily journal, text + voice** (`FEATURES.journal`, `src/features/journal/`, `/journal`).
   Two prompts and a blank space, one entry per LOCAL day, reachable from the nav and from a quiet
   line at the bottom of the daily briefing — the card people already read before starting is also
   where they look when they stop.
   **THE JOURNAL IS COMPLETE ON ITS OWN TERMS.** It used to carry a card saying an AI review layer
   "isn't built yet", with a chip to vote for it. AI is now CANCELLED (§5), so the card and the chip
   are gone: a page that keeps apologising for the absence of something nobody will build is an
   advert for a competitor. Two prompts and a blank space is the product.
   **The entry is ONE text column, not three.** The prompts are scaffolding for writing, not a
   schema — three columns would bake today's prompts into the database and make changing them a
   migration. `journal.ts` serialises the sections into one plain-markdown document and parses them
   back, and the invariant the tests pin is that NO KEYSTROKE IS EVER LOST: text above the first
   heading, an entry with no headings at all, a heading this build does not know, and the same
   section written twice all survive a round trip. A user's own `## Ideas` is kept verbatim rather
   than flattened, so editing an entry never destroys structure the app did not invent.
   **PAST ENTRIES ARE READ-ONLY** (and deletable). The value of "what could go better" is that it
   is what you thought at the time; a review you can quietly revise next week has stopped being a
   record of anything.
   **VOICE (Pro)** uses MediaRecorder with elapsed time DERIVED FROM A TIMESTAMP, never
   tick-counted — the same rule as the Focus timer, and it matters more here because a phone dims
   the screen while you talk. `unsupported`, `denied` and Free are three different situations with
   three different honest answers rather than one greyed-out button. Audio lives in the PRIVATE
   `journal-audio` bucket keyed `<user_id>/<file>`, because the storage policy checks that first
   path segment — the key shape IS the authorisation. Playback is a short-lived signed URL; the
   bucket carries its own size and MIME limits so the caps hold even if a client forgets them; and
   the `on conflict` clause RE-ASSERTS `public = false`, so re-running the migration repairs a
   bucket someone flipped public in the dashboard. `journalMigration.test.ts` pins all of that,
   because none of it would fail a TypeScript build if it were wrong.
   Save order with a recording is deliberate: upload the new object, write the row, and only then
   remove the one it replaced — a failure in the middle deletes the object just uploaded, so a
   failed save never leaves a file nobody can reach and everybody pays for.
   Free gets the text journal and the same `FREE_HISTORY_DAYS` window every other history surface
   uses (nothing deleted, the hidden count stated); Pro gets voice and unlimited history.
   One migration, **APPLIED** (§7). It also completes the `journal_7` challenge, which appears by
   itself once the table exists.


10. **All-in-one framing + the new Hub tiles** (`marketing/`, `hub/`). COPY AND TILES ONLY — no
    landing redesign, no new visual system.
    The all-in-one claim is made in **CATEGORY** terms and extends the existing `OnePlaceStrip`
    rather than adding a section: "One app instead of several" over a row of chips — *a day
    planner · a focus & pomodoro timer · a habit & quit tracker · a breathing coach* — plus the
    identical row on `/pricing`. **No brand names and no "replaces N apps"**: a number invites
    arithmetic nobody wins, and naming competitors makes the page about them. The two lists are
    deliberately identical, because two surfaces phrasing a claim slightly differently is how it
    stops being checkable.
    **THE JOURNAL AND MIND MAPS WERE HELD OUT OF BOTH LISTS UNTIL THEIR MIGRATIONS LANDED, AND ARE
    NOW IN THEM** (uncommented in `47b795f`; see `EverythingStrip` and `OnePlaceStrip`). While the
    tables were unapplied a stranger who signed up would have met the honest "not switched on yet"
    page instead of the category the line promised. The bar is what a visitor can DO, not whether
    the code is merged — the same bar Quit tracker and Vision waited behind in July. Challenges
    nearly went into the strip on the grounds that its table only records that you joined; that
    reasoning is wrong for the same reason and it is written down in the file.
    **The Hub's Journal tile stopped being a fake door** when the journal shipped: it is a real
    link to a real page. (The AI review layer it once pointed at is now cancelled outright, §5, and
    every trace of it has been removed from the journal, `/pricing` and the FAQ.) New tiles for Mind maps and Challenges, each gated by its own flag exactly like the
    rest; `hubTiles.test.ts`'s grid bound went 15 → 17, which is still a real limit rather than a
    formality.
    `e2e/marketing.spec.ts` gained the rule that matters: the all-in-one claim is categories only,
    carries no number and no brand, and **names every category it claims**, each of which must be a page a
    signed-up user can actually open. Its `SHIPPED` list gained all three new features, so the
    never-labelled-unbuilt guard has been armed since the strip lines were uncommented.

11. **Generated sleep noise** (`wellness/audio/noise.ts`, `wav.ts`, `noiseSource.ts`,
    `playback.ts`). White, pink and brown noise are now LIVE. **No audio file, no licence, no
    bundle weight, no migration** — the sound is arithmetic, generated in the browser at play time.
    **The DSP is a pure module and the tests check the physics, not the plumbing.** `generateNoise`
    is a seeded generator (`mulberry32`) so every run is byte-identical, and the suite asserts what
    actually distinguishes the three colours: `bandTilt` (a Goertzel single-bin magnitude ratio,
    low band over high) must come out strictly ordered `white < pink < brown`, with pink more than
    3x white and brown more than 3x pink. Asserting "the array is not all zeros" would have passed
    for three identical white-noise tracks; asserting the spectral slope is the only way to know
    that pink is pink. Pink is the Paul Kellet refined 7-pole filter and brown a leaky integrator,
    both warmed up 4096 samples before recording so the loop does not start on a transient.
    **THE ONE DEVIATION FROM THE OBVIOUS DESIGN, AND WHY.** The natural Web Audio shape is
    `AudioBufferSourceNode(loop: true)`. It is not used, because the requirement was that noise
    keeps playing when the tab is hidden and the phone screen locks — and a Web Audio graph is not
    a media session. Chrome and Safari suspend an AudioContext that has no media element behind it
    when the page is backgrounded, and neither offers lock-screen controls for one. So the same
    PCM an `AudioBuffer` would have held is encoded to a WAV blob (`wav.ts`, 16-bit mono) and
    played through the **existing** `<audio>` element, which the browser treats as real playback:
    it survives backgrounding, it appears on the lock screen, and it costs nothing extra because
    the player was already there. `vercel.json` needed `media-src 'self' blob:` for it — the CSP
    would have blocked the blob the moment it was enforced.
    Six seconds at 22.05 kHz per colour is about half a megabyte in memory and imperceptibly
    periodic (noise has no melody to recognise, so periodicity is the only tell). The loop point is
    an **equal-power crossfade** (`crossfadeLoop`) so the seam does not click, and the order matters:
    generate, crossfade, THEN normalise — normalising first lets the summed seam clip. `buildNoiseLoop`
    clamps its own fade to half the loop rather than throwing, because a helper that explodes on its
    own default is a trap for the next caller.
    Fades are `fadeGain`, a quarter-sine equal-power ramp over `FADE_MS = 400`, driven onto
    `el.volume`; the volume slider yields while a fade owns it. The sleep timer is **one
    `setTimeout` on a deadline** plus a 1s interval for the display only, so a throttled tab shows a
    stale countdown but still stops on time.
    **The tracks are FREE behind ONE constant: `SLEEP_NOISE_REQUIRES_PRO` in `src/lib/config.ts`**
    (currently `false`), read in exactly one place (`AudioSection.tsx`). Flipping it to `true` puts
    a Pro badge on all three and changes nothing else.
    Every "coming soon" claim about them is gone (hub, landing card, `/pricing`, FAQ, the
    `sleep_sounds` fake door), and the recorded half keeps its honest one. `featureIntentKeys.test.ts`
    lists `sleep_sounds` under RETIRED **BECAUSE IT SHIPPED**, which is deliberately distinguished
    from the two cancelled AI keys next to it. `e2e/sleep-sounds.spec.ts` proves real playback the
    only way a test can: the `<audio>` element's `currentTime` advances, `readyState >= 3` and
    `error` is null. A button label is not evidence and is not used. (Headless Chromium always runs
    `--mute-audio`, so no test anywhere can prove a speaker made a sound; the media pipeline is what
    is provable, and it is what is asserted.)

---

## 4. Roadmap (3 phases)

### Phase 0 — Foundation *(this session, done)*
Repo, tooling, design system, architecture, schema + RLS, auth, running app shell, PWA
manifest, docs. No full features.

### MVP — Effort-aware day planning *(done — Phase 1)*
- [x] Task CRUD (capture, edit, complete) in Inbox + Today.
- [x] `effort_minutes` on tasks; **Today capacity meter** (planned effort vs daily capacity).
- [x] Schedule tasks to a day (`scheduled_for`); **roll-over / recovery** of unfinished tasks.
- [x] Projects & sections for organization. Subtasks. Realtime sync via Supabase.
- [x] Per-user daily capacity (`profiles.daily_capacity_minutes`), editable in the meter.

### V1 — Focus & insight
- [x] Focus sessions / timer — **done** (task-bound Focus Mode; `focus_sessions`), plus a
      **Pomodoro** cadence and the one-tap `/work` entry point (2026-07-30).
- [x] Insights: planned-vs-actual effort, roll-over patterns, focus trends — **done** (Pro).
- [x] One-way calendar **read** (busy blocks → capacity) — **done**: `.ics` file on Free,
      server-side URL sync on Pro. Two-way sync stays out of scope (§5).
- Keyboard-first command palette (⌘K) — still to come.

### V2 — Depth & collaboration
- Shared workspaces (the `workspace_members` table is already collaboration-ready).
- [x] Recurring tasks — **done**.
- [x] Templates — **done**: a built-in catalog plus personal templates (`user_templates`).
- [x] Multi-day planning — **done**: `/week` + "Plan my week" (Pro).
- Smarter recovery suggestions (capacity-aware roll-over redistribution) still to come.

---

## 5. DO NOT BUILD YET

Out of scope until explicitly prioritized — do not start these:
- **External-tool integrations beyond calendar** (Slack, Jira, Notion, email, etc.).
- **Native apps** (iOS/Android/desktop). PWA only for now.
- **Two-way calendar sync** (writing events back). V1 is read-only busy import at most.
- **Team admin** (roles UI, billing, SSO, member management screens).

### CANCELLED, not deferred

**Anything that requires a paid third-party model provider is OUT OF THE PRODUCT PERMANENTLY**
(2026-07-31 owner decision): an AI coach, AI review or summarisation of the journal,
natural-language capture, AI suggestions, and text-to-speech.

This is a stronger statement than the list above, and the difference matters. "Not yet" invites the
next session to build it, and it left the product APOLOGISING on four surfaces for a gap nobody was
going to close. A page that keeps explaining why it has not built something is advertising the gap.

Everything referencing it is gone: the journal's "AI review isn't built yet" card, the `ai_coach`
and `voice_journal` interest chips, and the `/pricing` and FAQ entries. The `feature_key` CHECK
still permits the two retired keys, deliberately: narrowing it is a migration, nothing is pending,
and the rows already collected are real signal that should not be rewritten to match a later
decision. `featureIntentKeys.test.ts` lists them as RETIRED and fails if either goes live again, and
`e2e/marketing.spec.ts` fails if any public page so much as mentions one.

The planner, the estimator, the digest and the weekly review are PURE, DETERMINISTIC, UNIT-TESTED
logic and always were. None of them is affected by this, and none of them may ever be described as
AI.

If a request implies one of these, pause and confirm scope before building.

---

## 6. Data model quick reference

`profiles` (1:1 auth.users) · `workspaces` (owned) · `workspace_members` (collab-ready) ·
`projects` → `sections` → `tasks` → `subtasks`. Tasks carry `effort_minutes` +
`scheduled_for` (the differentiator). All mutable tables have `updated_at` triggers. RLS
isolates every row to workspaces the user **owns or is a member of**, enforced via
`SECURITY DEFINER` helpers (`is_workspace_member`, `is_workspace_owner`, `can_access_*`). A
new auth user is auto-provisioned a profile + default workspace + owner membership.

**Fake-door demand capture (insert-only, no read-back):** `upgrade_intents` (willingness-to-pay)
and `feature_intents` (interest in unbuilt features) — anon or authed may INSERT only their own
row (`user_id` null, or `= auth.uid()` when signed in); there is intentionally **no**
select/update/delete policy, so the client can never read them back.

**Wellness tracker (owner-only, user-scoped not workspace-scoped):** `wellness_items` +
`wellness_logs`, every row private to its owner via `user_id = auth.uid()` (items: full CRUD +
`updated_at` trigger; logs: append-only select/insert/delete; `wellness_logs.item_id` cascades on
item delete). See `supabase/migrations/`.

**Quit tracker (owner-only, user-scoped):** `quit_habits` + `quit_checkins`. `quit_habits` gets
full owner-only CRUD, the shared `set_updated_at` trigger, a `user_id` index and five size/shape
CHECKs; `quit_checkins` is **append-only** (select/insert/delete, deliberately **no UPDATE** — a
check-in is a fact about a day that already happened) with `UNIQUE (habit_id, checked_on)` so a
same-day repeat is a no-op, and `habit_id` cascades on habit delete. Both cascade on user delete, so
account deletion stays complete. Sensitive by nature (a preset may name a health or
sexual-behaviour category): **no** anon grant, no sharing surface, no aggregate read, no
service-role reader. `quitCaps.test.ts` pins the client caps to the CHECKs and pins the policy set
itself shut. **APPLIED** (live-verified 2026-07-30: table present, anon read `[]`, anon write `42501`).

**Vision cards (owner-only, user-scoped):** `vision_cards` — full owner-only CRUD, the shared
`set_updated_at` trigger, indexes on `user_id` and `project_id`, and title/why size CHECKs.
`position` is **double precision** so a drag is one UPDATE of one row (`lib/reorder.ts`), never a
reindex. `project_id` is nullable, `on delete set null` (a deleted project unlinks, it does not
delete the goal), and — because this table is user-scoped while `projects` are workspace-scoped —
the insert **and** update policies additionally require `public.can_access_project(project_id)`, so
owner-only RLS can't be used to store a project id the caller cannot read. No image columns by
design. **APPLIED** (live-verified 2026-07-30: table present, anon read `[]`, anon write `42501`).

**Mind maps (owner-only, user-scoped):** `mind_maps` — one row per map, the graph in two jsonb
columns (`nodes`, `edges`). Full owner-only CRUD, `set_updated_at`, a `user_id` index, and CHECKs on
title length, both columns being arrays, ≤200 nodes / ≤400 edges, and ≤64 KB each. A node may link
to a project or a task; because this table is user-scoped while both targets are workspace-scoped,
the insert **and** update policies additionally require `public.mind_map_links_ok(nodes)`, which
walks the array and defers to `can_access_project` / `can_access_task` per link — and rejects a
malformed id via a regex guard rather than casting it (a bare `::uuid` raises 22P02, aborting the
statement with a parse error instead of a clean policy denial). `mindMapCaps.test.ts` pins the
client caps to those CHECKs and pins the policy set and the link guard shut.

**Challenges (owner-only, user-scoped):** `user_challenges` — full owner-only CRUD, a `user_id`
index, `UNIQUE (user_id, challenge_key, started_at)`, and CHECKs on status, key length and the
completed-shape (a row claiming `completed` must carry a `completed_at`). **There is no progress
column and there must never be one** — see the migration header and `challengeMigration.test.ts`.
`started_at` is a `date` because every metric counts whole local calendar days.

**Journal (owner-only, user-scoped) + private storage:** `journal_entries` — full owner-only CRUD,
`set_updated_at`, a `user_id` index, `UNIQUE (user_id, entry_date)` (one entry per local day), and
CHECKs on text length, audio duration, and the audio SHAPE (`audio_path` and `audio_seconds` are
null together or set together). The whole entry lives in one `text` column; see the migration
header. Recordings live in the **private** `journal-audio` bucket, keyed `<user_id>/<file>`, with
four `storage.objects` policies requiring `(storage.foldername(name))[1] = auth.uid()::text` — the
key shape is the authorisation. The bucket carries its own `file_size_limit` and
`allowed_mime_types`, and the `on conflict` clause re-asserts `public = false` so re-running repairs
a bucket made public by hand. `journalMigration.test.ts` pins the caps, the privacy flag and every
policy.

> **THE CASCADE DOES NOT REACH STORAGE.** `delete_own_account()` removes the `auth.users` row and
> the whole FK graph goes with it — `journal_entries` included — but `storage.objects` has no
> cascading FK to `auth.users`, so the recordings themselves survived an account deletion: the row
> that NAMED a file was gone while the file stayed in the bucket, unreachable by the only person
> entitled to it and still on the bill. `removeAllJournalAudio` (client-side, run BEFORE the RPC,
> while the user still holds the session the bucket policy grants) closes it, and a failure there
> aborts the deletion rather than leaving a false promise. Its header explains the paging trap;
> `removeAllAudio.test.ts` pins it. **Any future bucket needs the same treatment** — a table is
> covered by the FK graph, an object is not.

**Personal templates (owner-only, user-scoped):** `user_templates` — full CRUD under
`user_id = auth.uid()`, `set_updated_at` trigger, `user_id` index, and size/shape CHECKs
(title 1–80, description ≤280, ≤100 tasks, `pg_column_size(tasks) ≤ 64KB`) as a backstop for the
client caps. `personalCaps.test.ts` pins the client constants to those CHECKs.

**Billing:** `billing` — SELECT-own only; the Stripe webhook writes via service-role.
**Calendar:** `calendar_sources` — owner-only; the server-side proxy reads through the
service-role client but filters by the JWT-verified caller.

> **The owner-only pattern.** Any NEW user-scoped table copies `wellness_items` verbatim:
> `user_id uuid not null references auth.users (id) on delete cascade`, four
> `<table>_{select,insert,update,delete}_own` policies on `user_id = auth.uid()`, the shared
> `public.set_updated_at()` trigger named `set_updated_at`, a `<table>_user_id_idx` index, and
> constraints added inside a `do $$ … end $$` block so the file is re-runnable.

---

## 7. Project state & post-wipe setup

> Durable state previously kept only in local agent memory — committed here so it survives a
> clean machine / fresh clone.

### Supabase (already provisioned)
- Live project ref **`lplsbfduankkpglyusjp`** → API URL `https://lplsbfduankkpglyusjp.supabase.co`.

>
> ### ✅ NOTHING PENDING — the cloud DB is fully migrated
> **Migrations are applied through `20260731140000_journal_entries`.** Do **NOT** run
> `supabase db push`; it should report the remote already up to date.
>
> The three files from the 2026-07-31 session were applied and verified live:
>
> | Migration | Evidence |
> | --- | --- |
> | `20260731120000_mind_maps` | table present; anon read `[]`, anon write `42501`; the full journey (create → add → connect → autosave → reload → Free cap) runs green |
> | `20260731130000_user_challenges` | table present; anon read `[]`, anon write `42501`; progress derived from 50 seeded tasks reads `50 of 50`, completion writes `status=completed` once |
> | `20260731140000_journal_entries` | table present; anon read `[]`, anon write `42501`; **and the bucket end-to-end**: upload lands under `<user_id>/…`, the signed URL serves real webm bytes, the PUBLIC url and an anonymous fetch both fail, another signed-in user can neither read, list nor write the folder, and deleting either the recording or the whole entry removes the object |
>
> All three E2E journeys that used to self-skip now RUN. The graceful-degradation paths stay in
> place (each hook still marks itself unavailable on `PGRST205`/`42P01`, and each page keeps its
> "not switched on yet" card) — they are DORMANT, not dead, and they are what makes a fresh
> Supabase project safe by default.
>
> **THE APPLIED MIGRATIONS PAID FOR THEMSELVES IMMEDIATELY.** Running the real journeys found a
> live bug no stub could: `MindMapsPage` rendered its "New map" button outside the loading branch,
> so a tap before the list arrived saw `maps.length === 0`, passed the Free cap, and created a
> SECOND map on a one-map plan. `VisionPage` had the identical shape. Both now refuse creation
> until the count is actually known — **a cap computed from data that has not arrived is not a cap.**
>
> ### ✅ Applied through `20260730150000_feature_intents_keys`
>
> The four files from the 2026-07-30 expansion were applied that day and verified live:
>
> | Migration | Evidence |
> | --- | --- |
> | `20260730120000_quit_habits` | `quit_habits` + `quit_checkins` present; anon read `[]`, anon write `42501`; insert 201, same-day repeat `409 / 23505` (the UNIQUE doing its job); slip PATCH 204 |
> | `20260730130000_user_template_style` | `select=style` on `user_templates` returns 200 |
> | `20260730140000_vision_cards` | table present; anon read `[]`, anon write `42501` |
> | `20260730150000_feature_intents_keys` | an invalid key is still rejected `23514`. **Which keys the CHECK allows cannot be read back** — `feature_intents` has no select policy by design, and a probe insert would leave an undeletable fake demand row. `featureIntentKeys.test.ts` pins the union against the migration file instead |
>
> Both previously-skipping E2E journeys now RUN against the live tables (quit: create → check in →
> slip → replacement; vision: add → link a project → reorder → Free limit).
>
> **The graceful-degradation paths are now DORMANT, not removed** — `useQuitHabits` /
> `useVisionCards` still mark themselves unavailable on `PGRST205`/`42P01`, `useUserTemplates` still
> falls back when the `style` column is missing, and both pages still have a "not switched on yet"
> card. Keep them: they are what makes a fresh Supabase project, or the next
> committed-but-unapplied migration, safe by default.

- **Migrations applied through `20260728120000_user_templates`.** Re-verified live 2026-07-25 via anon-key probes (RLS enforcing on
  every table: anon reads `[]`, anon writes `42501`), and `user_templates` itself was verified
  adversarially on 2026-07-30 (commit `3c355d2`): 15 checks, 0 failures — anon blocked, user B
  cannot read/update/delete user A's row nor insert a row owned by A, and an **unfiltered**
  `select *` by B returned nothing, so isolation is in the database, not in client filtering. Its
  four size/shape CHECKs are real, not decorative (all four rejected with `23514`).
  Confirmed applied: the events suite (`20260623120000_events` / `130000_events_auto_planned` /
  `140000_calendar_sources` — their columns resolve), `20260622150000_drop_resolve_login_email`
  (`resolve_login_email` → 404), and **`20260622160000_lock_complete_task_to_authenticated`
  (audit F1) IS NOW APPLIED** (anon `complete_task` → `42501 permission denied`, no longer the
  old `500 P0002`). See `docs/AUDIT_2026-06-22_followup.md` for the F1 rationale.
- `20260706120000_delete_own_account.sql` (SECURITY DEFINER self-deletion RPC) **IS NOW APPLIED**
  (live-verified: anon `delete_own_account` → `42501 permission denied`, no longer 404).
- `20260706130000_billing.sql` (the `billing` table for Stripe subscriptions — plan gate,
  SELECT-own RLS, no client writes; the webhook writes via service-role) **IS NOW APPLIED**
  (live-verified 2026-07-25: anon `select` on `billing` → `200 []`, anon `insert` → `42501 new row
  violates row-level security policy`, so the table exists with RLS enforcing). **Nothing to
  apply — do NOT run `supabase db push`.** Billing stays *functionally* off until Stripe keys are
  set (`usePlan` degrades gracefully; My Plan uses the fake-door); that is config, not a migration.
  Full turn-on runbook: `docs/BILLING_SETUP.md`.
- `20260728120000_user_templates.sql` (personal templates — owner-only CRUD mirroring
  `wellness_items`, `set_updated_at` trigger, `user_id` index, plus six size/shape CHECKs)
  **IS NOW APPLIED** (adversarially verified 2026-07-30, see above). `tasks` stores the SAME
  jsonb shape as the built-in catalog so one apply path serves both.
- Historical additions (all applied):
  - `20260616120000_accounts_username` — a unique, case-insensitive `profiles.username` (a
    profile **display identity**; usernames are not shown publicly) plus two pre-auth
    `SECURITY DEFINER` RPCs granted to `anon, authenticated` (`revoke … from public`):
    `username_available(text) -> boolean` (signup/settings availability hint, boolean-only, no
    PII) and (formerly) `resolve_login_email(text) -> text`. **Login is EMAIL-ONLY**: the
    username→email resolver was an anon enumeration oracle (audit **H1**) and is **dropped** by
    `20260622150000_drop_resolve_login_email` (live: 404). No anon-callable function returns PII:
    `username_available` returns a boolean; the SECURITY DEFINER RLS helpers
    (`is_workspace_member`, `project_workspace`, …) are anon-callable but return `false`/`null`
    for a null `auth.uid()` (audit **L1**, defense-in-depth).
  - `20260622120000_feature_intents` — fake-door interest capture for the Focus & Calm concepts
    (`feature_key in ('meditation','sleep_sounds','supplement_tracker')`). Insert-only RLS
    (`to anon, authenticated with check (user_id is null or user_id = auth.uid())`); NO
    select/update/delete — sibling to `upgrade_intents`, so the client can't read it back.
  - `20260622130000_wellness_tracking` — the tracker's `wellness_items` + `wellness_logs`.
    Owner-only RLS (`user_id = auth.uid()`): items get select/insert/update/delete + the shared
    `set_updated_at` trigger; logs are append-only (select/insert/delete); `wellness_logs.item_id`
    references `wellness_items` `on delete cascade`.
  - The earlier `20260615120000_upgrade_intents` (willingness-to-pay fake-door, insert-only) and
    `20260607090000_task_workspace_integrity` (task↔workspace co-location guard + the
    `project_workspace()` / `section_workspace()` SECURITY DEFINER helpers) remain in place.
  Don't re-create the schema or re-run migrations — `supabase db push` should report the remote
  already up to date.

### Restoring a clean machine / fresh clone

> **`git` itself is wiped too.** Deep Freeze restores the system partition, so `C:\Program Files\Git`
> disappears while `Documents\projects\todonado` (working tree, `.git`, even `node_modules`) can
> survive intact — the repo looks fine and every `git` command reports "not found". `gh` survives
> (`C:\Program Files\GitHub CLI`) and its keyring token survives, so **install git with gh**:
> `gh release download -R git-for-windows/git --pattern "*64-bit.exe"` then run it with
> `/VERYSILENT /NORESTART`. The installer adds git to the **machine** PATH, but an already-running
> agent shell will NOT see it — prepend `C:\Program Files\Git\cmd` to `$env:PATH` in each command
> until a new shell is started. *(Verified on the 2026-07-30 restore.)*

0. **Run `gh auth setup-git` BEFORE the first clone.** A wipe clears git's global credential-helper
   config *even though the `gh` keyring token survives*, so the clone otherwise dies instantly with:
   ```
   fatal: could not read Username for 'https://github.com': terminal prompts disabled
   ```
   That message looks like an auth failure but is **not** one — `gh auth status` will be green and
   the token is perfectly valid; only git's plumbing *to* that token was wiped.
   **The fix is `gh auth setup-git`** (it sets `credential.https://github.com.helper` to
   `!gh auth git-credential`), **NOT `gh auth login`** — reaching for `gh auth login` here is the
   wrong diagnosis and costs a pointless round trip through a real terminal.
   Only escalate to `gh auth login` in a **real terminal** (browser flow) if `gh auth status`
   *itself* reports the token missing/invalid. *(Verified again on the 2026-07-25 restore.)*

   Then clone the **private** repo into `C:\Users\bdstd\Documents\projects` (so it lands at
   `…\projects\todonado`) → `gh repo clone ahmedmagdy1987/todonado`, or
   `git clone https://github.com/ahmedmagdy1987/todonado.git`.
1. `npm install`
2. `npm run dev` — the app runs with **no `.env`**: `src/lib/env.ts` ships the public Supabase
   URL + anon key as built-in defaults (anon key is public + RLS-protected). To target a
   different project or override, `cp .env.example .env` and set `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` (a non-empty value wins over the default). Never commit `.env`.
3. Set the per-repo git identity:
   `git config user.name "ahmedmagdy1987"` · `git config user.email "ahmedkassim17777@gmail.com"`.
4. **Do NOT re-run migrations** — the cloud DB is current through
   `20260730150000_feature_intents_keys` and nothing is pending (see the box above).
   Only when adding a **new** migration, use a **real terminal** (TTY — see CLI note):
   `supabase login` → `supabase link --project-ref lplsbfduankkpglyusjp` → `supabase db push`.
5. `npx playwright install chromium` — **a wipe also clears `~/AppData/Local/ms-playwright`**, so
   `npm run e2e` dies with `Executable doesn't exist at …chrome-headless-shell.exe`. That is a
   missing *browser*, not a broken suite. CI installs its own browsers, so this step is local-only.
   *(Hit on the 2026-07-30 restore.)*
6. Sanity-check the cloud is awake before assuming anything is broken: a bogus login should return
   **HTTP 400** from GoTrue (`POST /auth/v1/token?grant_type=password` with the anon key). 400 =
   the project is up and rejecting bad credentials. If `lplsbfduankkpglyusjp.supabase.co` is
   **NXDOMAIN**, the project is paused — restore it from the Supabase dashboard first; no amount of
   local work will fix that.

### Agent / CLI note (verified on this machine — Windows + PowerShell)
- **`git push` from the agent's PowerShell tool relies on a VALID GitHub token** — supplied by
  the Windows Git Credential Manager and/or `gh`, so a push usually needs no interactive step.
  But that token CAN expire / be invalidated mid-session: if a push fails with
  `Invalid username or token` / `Authentication failed` (or `gh auth status` reports the keyring
  token invalid), run `gh auth login` (or `gh auth refresh -h github.com -s repo`) in a **real
  terminal** (browser flow — NOT the non-TTY agent shell or the `!` prefix), then retry the push.
  **First distinguish the two failure modes** (see restore step 0): `could not read Username …
  terminal prompts disabled` means git has **no credential helper** → `gh auth setup-git`, no
  browser needed. `Invalid username or token` / `Authentication failed` means the **token itself**
  is bad → `gh auth login` in a real terminal. Network + REST/curl verification also work from
  PowerShell (the old Bash-sandbox network block does not apply here).
- **`supabase login` CANNOT run in the agent shell** (the `!` prefix and the PowerShell tool are
  non-TTY): it errors `Cannot use automatic login flow inside non-TTY environments`. Do it in a
  **real terminal** where the browser flow works, or set `SUPABASE_ACCESS_TOKEN` / pass `--token`.
  The browser step of `gh auth login` is the same — real TTY or `--with-token`.
- **Applying a migration:** in a real terminal → `supabase login` → `supabase link --project-ref
  lplsbfduankkpglyusjp` → `supabase db push` (prompts `[Y/n]`; add `--yes` to auto-confirm).

### CI — pushes are cloud-verified (protects the wipe-prone machine)
Every push / PR to `main` runs **GitHub Actions** (`.github/workflows/ci.yml`), so work is
validated in the cloud even when this machine's local gates are skipped or it gets wiped:
- **`verify` job:** `npm ci` → typecheck → lint → unit tests → build.
- **`e2e` job:** a **Playwright** (chromium) browser smoke (`npm run e2e`, config
  `playwright.config.ts`, specs in `e2e/`) driving the Vite dev server against the **real cloud
  Supabase** (the fresh-user journey: landing → signup → onboarding → template → auto-plan → deep
  routes; plus reset-password/forgot non-enumeration). It signs up a unique throwaway account and
  **self-deletes** it via the `delete_own_account` RPC (with a best-effort `afterAll` safety net),
  so runs never pollute the DB.
- **No CI secrets are required** — the Supabase URL + public anon key are baked into the app
  (RLS-protected). The E2E depends on **mailer autoconfirm being ON** (signup returns a session,
  no email step) and on `20260706120000_delete_own_account` being applied (it is, live-verified).
  Out of scope by design: email receipt, Stripe, ICS URL/file fetch.

### Repo
`ahmedmagdy1987/todonado` (private), default branch `main`.
