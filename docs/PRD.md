# Todonado — Product Requirements (condensed, MVP)

## Vision
A dark, mission-control **daily command center**. Not another to-do list — a place to
**capture everything, plan a realistic day, execute with focus, and recover intelligently.**

## Target user
Individual knowledge workers who over-commit and lose the day to an ever-growing list. They
don't need more places to dump tasks — they need to decide what actually fits *today* and
protect that decision.

## The ONE MVP differentiator
**Effort-aware Today planning with a capacity meter + lightweight roll-over/recovery.**

Most apps let you *list* and *schedule* tasks. Todonado makes the day **honest**:

1. **Effort tagging.** A task can carry an estimate (`effort_minutes`).
2. **Capacity meter.** The **Today** screen sums the effort of everything scheduled for the
   day and shows it against the user's daily capacity (default 6h). As the user pulls work
   into today, the meter fills; crossing capacity triggers a clear over-commit warning.
3. **Roll-over / recovery.** At day's end, unfinished tasks don't silently pile up or shame
   the user — they surface for a quick, intentional roll-over to a future day (or back to the
   Inbox), keeping the plan realistic.

Everything else in the MVP exists to feed this loop.

## MVP scope

### In scope
- **Auth:** Supabase email/password + magic link. Auto-provisioned profile + default
  workspace on signup. Protected app behind login.
- **Capture (Inbox):** frictionless task capture (title, optional notes, effort, priority).
- **Today (command center):** date header + greeting, capacity meter, the day's scheduled
  tasks, complete/uncomplete, and roll-over of unfinished items. Empty state:
  *"Your day is clear. Pull in what matters most."*
- **Tasks:** CRUD; fields = title, notes, status (`todo/in_progress/done/cancelled`),
  priority (0–3), `due_date`, `effort_minutes`, `scheduled_for`, ordering, `completed_at`.
- **Organization:** projects (name, color, status) → sections → tasks; subtasks.
- **Sync:** all server state through TanStack Query; Supabase realtime keeps views fresh.
- **Data isolation:** RLS so users only touch their own workspaces' rows.

### Out of scope for MVP (see CLAUDE.md "DO NOT BUILD YET")
Focus timer & insights (V1), command palette (V1), calendar busy-import (V1), AI, native
apps, two-way calendar sync, external integrations beyond calendar, team admin.

## Key screens
- **Login** — branded, email/password + magic link, guides Supabase setup if unconfigured.
- **Today** — the cockpit; capacity meter is the hero element.
- **Inbox** — capture & triage.
- **Projects** — organize work.
- **Focus / Insights** — placeholders in Phase 0; built in V1.

## Success signals (MVP)
- A user can capture a task, give it an effort estimate, schedule it for today, and watch the
  capacity meter respond.
- Crossing daily capacity produces an honest warning.
- Unfinished tasks can be rolled over in one action the next day.

## Non-functional
- **Dark, fast, installable (PWA).** Strict TypeScript. RLS-first security. Battle-tested
  patterns only (no novel auth/sync/theming inventions).
