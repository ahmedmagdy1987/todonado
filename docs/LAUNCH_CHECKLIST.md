# Todonado — Launch Checklist

> The honest finish line. Written 2026-07-06 after the final pre-launch pass
> (Stage 1 launch hygiene, Stage 2 security+correctness audit, Stage 3 this doc).
> Head of `main`: see the last commit. Nothing here is aspirational — items are
> either **verified done**, a **code item** (with status), or an **owner action**
> (non-code, only you can do it).

---

## 0. THE ONE HARD BLOCKER (do this first)

**Apply the pending migration.** The Settings → "Delete account" button calls
`delete_own_account()`, which does **not exist on the cloud DB yet** (verified:
the RPC returns 404 `PGRST202`). Until you apply it, clicking Delete account
errors for every user.

```
supabase link --project-ref lplsbfduankkpglyusjp   # you link via SUPABASE_ACCESS_TOKEN
supabase db push                                    # applies 20260706120000_delete_own_account.sql
```

**Migrations still to apply: exactly ONE — `20260706120000_delete_own_account.sql`.**
Everything else is already live (see §4). After pushing, re-run the smoke check in §5.

---

## 1. VERIFIED DONE (code + live-DB state)

### Stage 1 — launch hygiene (commit `de5624f`)
- **Password reset, full flow.** "Forgot password?" on `/login` →
  `resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })` → a new
  public `/reset-password` page that sets the new password from the recovery
  session. Handles expired/used links, the slow-token-exchange race, and a
  signed-in user changing their password. Non-enumerating copy ("If an account
  exists…") on every branch.
- **Real account deletion.** `delete_own_account()` SECURITY DEFINER RPC:
  `authenticated`-only EXECUTE (revoked from `anon`/`public`), `search_path`
  pinned to `''`, guarded on a null `auth.uid()`, deletes the caller's
  `auth.users` row. The FK graph was cross-checked cascade-complete
  (tasks/projects/sections/subtasks/profiles/workspaces/workspace_members/
  focus_sessions/wellness_items/wellness_logs/calendar_sources all `ON DELETE
  CASCADE`; events/upgrade_intents/feature_intents `SET NULL` by design).
  UI is type-`DELETE`-to-confirm, then local sign-out + hard reload to `/welcome`
  (no cached user data survives). *(Live only after §0.)*
- **LEGAL_CONTACT** is now one config constant — `src/lib/config.ts` (see §3).

### Stage 2 — security & correctness audit (commit `2db3dde`)
Adversarial multi-agent audit of everything since the last audit (`bd2db67`):
Phase 1 analytics, 3A auto-effort, 3B auto-plan, 3C calendar ICS, 2A streak,
plus Stage 1. 12 findings, each independently verified (0 false positives), all
fixed with tests. Gates green: **typecheck · lint · 277 tests · build**.

- **RLS proven correct against the LIVE DB (anon-key probes):**
  - Full-table sweep — all 14 tables return `[]` to anon SELECT (RLS filtering,
    no leak).
  - `events` — insert-only: anon may insert its own/`null` row but **cannot**
    spoof another user's `user_id` (42501) or forge an event name (23514), and
    the table has **no read-back** (SELECT `[]`; `return=representation` is
    denied). No PII beyond `user_id` (verified every `track()` call site — `source`
    is always a fixed UI-location string, `flag` is a boolean; never task text).
  - `calendar_sources` — owner-only: anon insert rejected for both a spoofed and a
    null `user_id` (42501). No cross-user path.
- **Fixed (security/privacy):** auth enumeration oracle in forgot-password +
  magic-link (the per-email rate-limit 429 only fires for existing emails — now
  swallowed into the neutral copy); `delete_own_account` now scrubs
  `upgrade_intents.email` before deleting `auth.users` so the erasure is complete.
- **Fixed (untrusted input):** URL-subscribe `fetchIcs` now has a 15s timeout +
  abort-signal forwarding + an 8 MB streamed byte cap, so a hostile/oversized/
  tar-pit `.ics` can't hang or OOM the tab.
- **Fixed (correctness):** repeated "Plan my day" could overcommit (estimated
  picks weren't charged on the next run); lowercase-legal calendars were dropped;
  NaN-proofed the busy-minutes clamp; focus-trend per-day rounding drift; non-finite
  capacity guard in insights/capacity; `suggestEffort` NaN on `minSamples<=0`.
- **Fixed (UX):** expired reset link showed a pointless 2.5s spinner.

---

## 2. CODE ITEMS STILL OPEN

**None.** All 12 audited findings are fixed and pushed; all gates pass. The
`delete_own_account` code is complete — its only dependency is the migration in
§0, which is an owner action (you apply migrations), not a code gap.

---

## 3. OWNER ACTIONS (non-code — only you can do these)

Ordered roughly by launch-blocking severity.

1. **Custom SMTP — REQUIRED before sharing signup/reset links.** Supabase's
   built-in mailer is rate-limited to a few emails per hour and is not meant for
   production. Signup-confirmation, password-reset, and magic-link emails will
   silently fail to deliver under any real volume. Wire a real provider (Resend,
   Postmark, or SES) in **Supabase → Project → Authentication → Emails → SMTP**
   before you share the app. Without this, the password-reset feature you just
   built effectively doesn't reach users.

2. **Confirm the SPA deep-link rewrite on the host, then TEST `/reset-password`
   directly.** The app uses `BrowserRouter`, so the host (Vercel/Netlify/etc.)
   must rewrite all unknown paths to `index.html`. The reset email links straight
   to `https://www.todonado.com/reset-password` — if the host isn't configured
   for SPA fallback, that URL 404s and reset is dead. This is in the smoke script
   (§5, "deep-route refresh") — actually click it.

3. **Supabase redirect allowlist.** In **Authentication → URL Configuration**, set
   the **Site URL** to your production origin and add **Redirect URLs** covering
   the reset landing page: `https://www.todonado.com/**`, `https://todonado.com/**`,
   and `http://localhost:5173/**` (for local testing). The reset `redirectTo` is
   `<origin>/reset-password`, so these wildcards cover it — but verify they're
   present; a missing entry makes Supabase reject the redirect.

4. **Real support/legal email.** Replace the placeholder in **one** place:
   `src/lib/config.ts`, the line `export const LEGAL_CONTACT = '[your contact
   email]'`. Every legal page reads from it.

5. **Legal pages are AI-drafted placeholders — get them reviewed before you
   charge money.** `PrivacyPage.tsx` / `TermsPage.tsx` are reasonable scaffolds,
   not a lawyer's work. Before taking payment, have them reviewed and set an
   accurate "Last updated" (`LEGAL_LAST_UPDATED` in `legal/LegalLayout.tsx`).

6. **Supabase free-tier PAUSING.** The free-tier project sleeps after ~1 week of
   inactivity (this happened between our sessions — the DB was paused and had to be
   restored). Before you share links publicly, confirm the project is active; move
   to a paid plan once real users arrive so it never pauses mid-launch.

7. **Wellness audio files.** Every track ships with an empty `src` and shows
   "Audio coming soon" (no copyrighted audio is bundled, by design). If you're
   launching the Focus & Calm suite (`FEATURES.wellness` is ON), drop licensed/CC0
   files into `public/audio/` (see `public/audio/README.md`) or flip the flag off
   so users don't hit empty players.

8. **Billing is demand-capture only — no Stripe yet.** There is no real
   subscription state: "Pro" is a founding-email allowlist + a local preview
   override (`src/features/billing/plan.ts`), and the pricing CTAs record
   `upgrade_intents` (a fake door). This is fine for launch, but do **not** imply
   users can pay until you build Stripe checkout. When you do, start in test mode.

9. **Clear analytics test rows (optional).** During the audit I inserted a handful
   of anonymous probe rows (`events`: 1 `day_returned`; `feature_intents`: 2–3),
   all `user_id = null`, no PII. Delete them in the SQL editor before you read real
   launch numbers if you want a clean baseline:
   `delete from events where user_id is null and created_at < now();` (scope as you
   like) — or just ignore the tiny anonymous count.

10. **Error tracking (Sentry) — recommended, ~30 min.** To add it: `npm i
    @sentry/react`, then in `src/main.tsx` call `Sentry.init({ dsn, integrations:
    [Sentry.browserTracingIntegration()], tracesSampleRate: 0.1 })` before render,
    and optionally swap `src/components/common/ErrorBoundary.tsx` for
    `Sentry.ErrorBoundary`. Put the DSN in `.env` as a `VITE_` var (it's a public
    client key). Without it you're blind to client-side errors in production.

---

## 4. MIGRATION STATE (live DB, verified 2026-07-06)

Verified by anon-key probes against `lplsbfduankkpglyusjp`:

- **Applied and live** (more current than CLAUDE.md §7 claimed):
  everything through `20260623140000_calendar_sources` — including `events`,
  `events_auto_planned`, `calendar_sources` (their migration-specific columns all
  resolve), and **`20260622160000_lock_complete_task_to_authenticated` (F1)** is
  applied (anon `complete_task` → `42501 permission denied`, not the old 500).
  `resolve_login_email` is gone (404, as intended).
- **NOT applied — the only pending migration:**
  `20260706120000_delete_own_account.sql` (see §0).

> CLAUDE.md §7 was stale (it listed F1 as pending and understated the applied set);
> it's been corrected in this pass.

---

## 5. LAUNCH SMOKE SCRIPT (run on www.todonado.com as a fresh user)

Do this end-to-end **after** applying the migration (§0) and configuring SMTP (§3.1),
in one sitting, in an incognito window:

1. **Sign up** — `/login` → Sign up → name + username (watch the availability
   hint) + email + password → land in onboarding.
2. **Onboarding** — walk the 4 steps (welcome → daily capacity → capture → plan
   today); confirm you land on a planned Today with a live capacity meter.
3. **Template** — apply a template from `/templates`; confirm tasks appear.
4. **Capacity** — add effort to a few tasks; watch the meter move; overbook it and
   confirm the over-capacity warning + "move to tomorrow" suggestion.
5. **Auto-plan** — click "Plan my day"; confirm the preview never exceeds remaining
   capacity, apply it, then click "Plan my day" **again** and confirm it doesn't
   re-overfill (the Stage 2 fix).
6. **Deep-route refresh** — navigate to `/insights` (or any in-app route) and hit
   **browser refresh**; confirm it loads (not a 404). Then open
   `https://www.todonado.com/reset-password` **directly** — confirm it renders the
   reset page, not a 404 (this is the SPA-rewrite check, §3.2).
7. **Password reset** — sign out → "Forgot password?" → submit your email →
   receive the email (proves SMTP) → click the link → set a new password →
   confirm you're signed in → sign in again with the new password.
8. **(After you're satisfied)** — Settings → Delete account → type `DELETE` →
   confirm you're signed out and the account is gone (proves the migration).

### The 3 numbers to watch once real users arrive
Run these from `docs/ANALYTICS_QUERIES.sql` in the Supabase SQL editor:

1. **Effort-entry rate** — the wedge's vital sign: of tasks created, what % carry
   an effort estimate (`pct_with_effort`, query **#4**). If this is low, the
   capacity meter isn't being fed and the differentiator isn't landing.
2. **Day-2 / Day-3 return** — do users come back? `day_returned` per day
   (query **#5**) and the activation funnel's `returned` count (query **#6**).
3. **Upgrade-intent clicks** — willingness to pay before Stripe exists:
   `upgrade_intents` by tier, including how many left an email (query **#2**).

---

## 6. ANYTHING ELSE THAT COULD BLOCK OR EMBARRASS A LAUNCH

- **Email deliverability is the real risk** (§3.1). Everything auth-facing —
  signup confirmation, reset, magic link — depends on it. Test #7 in the smoke
  script is the true go/no-go.
- **The delete button is dead until the migration ships** (§0). Don't demo it
  until then.
- **Decide the signup email-confirmation setting** (Supabase → Auth → Providers →
  Email → "Confirm email"). The code handles both auto-confirm (straight into
  onboarding) and confirm-required (inbox step), but you should pick deliberately
  — and if confirmation is required, SMTP (§3.1) is doubly load-bearing.
- **`.env` is optional but supported.** The app ships the public Supabase URL +
  anon key as defaults, so prod runs with no `.env`. That's intentional and safe
  (anon key is RLS-protected). Just never commit a real `.env` or the service_role
  key.
- **No rate-limit/abuse protection on the fake-door inserts.** `events`,
  `feature_intents`, `upgrade_intents` accept anonymous inserts by design (that's
  how anonymous demand is measured). A determined actor could inflate those
  counts. Acceptable for launch (no PII exposure, insert-only, no read-back), but
  don't treat the raw numbers as fraud-proof.
- **Bundle size** — the main JS chunk is ~484 KB (129 KB gzip). Fine for launch;
  a candidate for route-based code-splitting later if you care about first-paint.
