# Todonado — Roadmap

Phased plan. Each phase builds on the last; don't pull later-phase work forward without
explicitly re-prioritizing. See `CLAUDE.md` for the "DO NOT BUILD YET" guardrails.

---

## Phase 0 — Foundation ✅ (current)
**Goal:** a clean, production-grade skeleton everything else can be built on.

- [x] Repo + tooling: Vite + React 18 + TypeScript (strict), Tailwind v3, ESLint, path alias.
- [x] Design system: locked dark tokens, fonts, gradient/elevation, 4 primitives.
- [x] Architecture: feature-based folders, TanStack Query, React Router v6.
- [x] Data: Supabase client, full schema, `updated_at` triggers, workspace-isolated RLS,
      auth bootstrap trigger, `.env.example`.
- [x] Auth: email/password + magic link, AuthProvider, protected routes.
- [x] App shell: mission-control sidebar + topbar; Today fleshed out (capacity meter +
      empty state); Inbox/Projects/Focus/Insights placeholders.
- [x] PWA: installable manifest + icons. *(Service worker deferred — see TODO.)*
- [x] Docs: CLAUDE.md, PRD, ROADMAP, README.

**No full features yet** — clean structure over feature count.

---

## MVP — Effort-aware day planning ✅ (Phase 1)
**Goal:** ship the differentiator end-to-end.

- [x] Task CRUD with TanStack Query + Supabase (create/edit/complete/delete), optimistic.
- [x] Inbox capture (title, notes, `effort_minutes`, priority).
- [x] **Today capacity meter** wired to real data (Σ `effort_minutes` of `scheduled_for`
      today vs daily capacity; over-commit warning + move-to-tomorrow suggestions).
- [x] Schedule tasks to a day; **roll-over / recovery** of unfinished tasks (with undo).
- [x] Projects + sections + subtasks (with drag-reorder).
- [x] Supabase realtime sync across views (flagged in `src/lib/config.ts`).
- [x] User setting: daily capacity (minutes), editable in the meter.

**Exit criteria (met):** capture → estimate → schedule → meter responds → roll over tomorrow.

---

## V1 — Focus & insight 🔭
- [ ] Focus sessions / timer fed by the planned day; protect deep work.
- [ ] Insights: planned-vs-actual effort, roll-over patterns, focus trends.
- [ ] Command palette (⌘K), keyboard-first navigation.
- [ ] **One-way** calendar read: import busy blocks to reduce available capacity.

---

## V2 — Depth & collaboration 🤝
- [ ] Shared workspaces (the `workspace_members` table is already collaboration-ready).
- [ ] Recurring tasks & templates.
- [ ] Smarter recovery suggestions (rules-based, like everything else here).

---

## Deferred / explicitly out of scope
Native apps · two-way calendar sync · external integrations beyond calendar ·
team admin (roles UI, billing, SSO) · offline service worker (revisit after MVP).

**CANCELLED permanently (2026-07-31):** anything needing a paid third-party model provider, meaning
an AI coach, AI review of the journal, natural-language capture and text-to-speech. Not deferred and
not "revisit later": out of the product. See CLAUDE.md §5.
