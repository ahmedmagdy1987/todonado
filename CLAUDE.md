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
  key) reach the browser, via `.env` (gitignored). Never commit `.env`; never hardcode keys.
- **Path alias:** import from `@/…` (maps to `src/`).
- **Design tokens only.** No raw hex in components — use the Tailwind tokens above.
- **Accessibility:** label controls, mark decorative icons `aria-hidden`, keep focus rings.

> **Golden rule:** Use established, battle-tested patterns for auth, RLS, realtime sync,
> theming, and TanStack Query — **don't invent novel approaches for solved problems.**

### Verify before you commit
`npm run typecheck` · `npm run lint` · `npm run build` must all pass. Commit in small,
logical commits.

---

## 4. Roadmap (3 phases)

### Phase 0 — Foundation *(this session, done)*
Repo, tooling, design system, architecture, schema + RLS, auth, running app shell, PWA
manifest, docs. No full features.

### MVP — Effort-aware day planning
- Task CRUD (capture, edit, complete) in Inbox + Today.
- `effort_minutes` on tasks; **Today capacity meter** (planned effort vs daily capacity).
- Schedule tasks to a day (`scheduled_for`); **roll-over / recovery** of unfinished tasks.
- Projects & sections for organization. Subtasks. Realtime sync via Supabase.

### V1 — Focus & insight
- Focus sessions / timer drawing from the planned day.
- Insights: planned-vs-actual effort, roll-over patterns, focus trends.
- Keyboard-first command palette (⌘K). One-way calendar **read** (busy blocks → capacity).

### V2 — Depth & collaboration
- Shared workspaces (the `workspace_members` table is already collaboration-ready).
- Recurring tasks, templates, smarter recovery suggestions.

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
new auth user is auto-provisioned a profile + default workspace + owner membership. See
`supabase/migrations/`.
