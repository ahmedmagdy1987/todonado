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
    today/     # TodayPage (command center), CapacityMeter
    inbox/ projects/ focus/ insights/   # feature pages
    wellness/  # "Focus & Calm" suite — breathwork/ audio/ tracker/ + /wellness hub (FEATURES.wellness)
  lib/         # supabase, env, queryClient, utils
  routes/      # AppRoutes
  types/       # database row types
supabase/
  migrations/  # SQL: schema, RLS, auth bootstrap
docs/          # PRD, ROADMAP
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
it that way. Commit in small, logical commits.

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
`profiles.onboarding_completed`, never re-shown once finished/skipped. **Insights** remains a
placeholder (V1).

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
  `tracks.ts` manifest (`id, title, description, category 'sleep'|'meditation', src?, durationSec?`).
  **NO copyrighted audio is bundled**: every track ships with empty `src` and shows an "Audio
  coming soon" state until licensed/CC0 files are dropped in `public/audio/` (served at `/audio/…`)
  or pointed at a Supabase Storage URL — see `public/audio/README.md`.
- **Supplement / medication tracker** (`wellness/tracker/`) — owner-only CRUD over `wellness_items`
  + `wellness_logs` (TanStack Query, optimistic, mirrors `useTaskMutations`): add/edit/delete,
  mark-taken-today, taken-streak (pure `tracking.ts`, unit-tested), and recent activity. A
  **PERSONAL LOG ONLY** — no drug database, interaction/contraindication checks, or dosing logic;
  `dose`/`schedule` are free text — with a persistent, non-dismissible "not medical advice"
  disclaimer.

A read-only **fake-door teaser** for Focus & Calm also lives on the `/welcome` marketing page
(records `feature_intents`); it is independent of `FEATURES.wellness`.

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
- [x] Focus sessions / timer — **done** (task-bound Focus Mode; `focus_sessions`).
- Insights: planned-vs-actual effort, roll-over patterns, focus trends.
- Keyboard-first command palette (⌘K). One-way calendar **read** (busy blocks → capacity).

### V2 — Depth & collaboration
- Shared workspaces (the `workspace_members` table is already collaboration-ready).
- [x] Recurring tasks — **done**. Templates, smarter recovery suggestions still to come.

---

## 5. DO NOT BUILD YET

Out of scope until explicitly prioritized — do not start these:
- **External-tool integrations beyond calendar** (Slack, Jira, Notion, email, etc.).
- **AI features** (auto-planning, summarization, NL capture, suggestions).
- **Native apps** (iOS/Android/desktop). PWA only for now.
- **Two-way calendar sync** (writing events back). V1 is read-only busy import at most.
- **Team admin** (roles UI, billing, SSO, member management screens).

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

---

## 7. Project state & post-wipe setup

> Durable state previously kept only in local agent memory — committed here so it survives a
> clean machine / fresh clone.

### Supabase (already provisioned)
- Live project ref **`lplsbfduankkpglyusjp`** → API URL `https://lplsbfduankkpglyusjp.supabase.co`.
- **All migrations are applied** (through `20260622130000_wellness_tracking`, the latest file on
  disk) and RLS is verified enforcing on every table (anon reads return `[]`; anon writes are
  rejected with `42501`). Recent additions, all applied live on the cloud:
  - `20260616120000_accounts_username` — username login: a unique, case-insensitive
    `profiles.username`, plus two pre-auth `SECURITY DEFINER` RPCs (`username_available(text)`,
    `resolve_login_email(text)`) with `execute` granted to `anon, authenticated` (and `revoke …
    from public`).
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
0. Clone the **private** repo into `C:\Users\bdstd\Documents\projects` (so it lands at
   `…\projects\todonado`). `gh` is usually still authed after a wipe → `gh repo clone
   ahmedmagdy1987/todonado`. If the clone fails on auth, run `gh auth login` in a **real terminal**
   (browser flow), then retry.
1. `npm install`
2. `npm run dev` — the app runs with **no `.env`**: `src/lib/env.ts` ships the public Supabase
   URL + anon key as built-in defaults (anon key is public + RLS-protected). To target a
   different project or override, `cp .env.example .env` and set `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` (a non-empty value wins over the default). Never commit `.env`.
3. Set the per-repo git identity:
   `git config user.name "ahmedmagdy1987"` · `git config user.email "ahmedkassim17777@gmail.com"`.
4. **Do NOT re-run migrations** — the cloud DB is already current (through
   `20260622130000_wellness_tracking`). Only when adding a **new** migration, use a **real
   terminal** (TTY — see CLI note): `supabase login` → `supabase link --project-ref
   lplsbfduankkpglyusjp` → `supabase db push`.

### Agent / CLI note (verified on this machine — Windows + PowerShell)
- **`git push` from the agent's PowerShell tool relies on a VALID GitHub token** — supplied by
  the Windows Git Credential Manager and/or `gh`, so a push usually needs no interactive step.
  But that token CAN expire / be invalidated mid-session: if a push fails with
  `Invalid username or token` / `Authentication failed` (or `gh auth status` reports the keyring
  token invalid), run `gh auth login` (or `gh auth refresh -h github.com -s repo`) in a **real
  terminal** (browser flow — NOT the non-TTY agent shell or the `!` prefix), optionally
  `gh auth setup-git` to point git at gh's credential, then retry the push. Network + REST/curl
  verification also work from PowerShell (the old Bash-sandbox network block does not apply here).
- **`supabase login` CANNOT run in the agent shell** (the `!` prefix and the PowerShell tool are
  non-TTY): it errors `Cannot use automatic login flow inside non-TTY environments`. Do it in a
  **real terminal** where the browser flow works, or set `SUPABASE_ACCESS_TOKEN` / pass `--token`.
  The browser step of `gh auth login` is the same — real TTY or `--with-token`.
- **Applying a migration:** in a real terminal → `supabase login` → `supabase link --project-ref
  lplsbfduankkpglyusjp` → `supabase db push` (prompts `[Y/n]`; add `--yes` to auto-confirm).

### Repo
`ahmedmagdy1987/todonado` (private), default branch `main`.
