# Todonado — Security & correctness re-audit (follow-up) · 2026-06-22

Focused re-audit after shipping **H6** (`bed9635`), **H5/H2** (`09ae072`), and **H1** (`3dbdd5c`).
Two goals: **(a) verify** the fixes actually closed their issues against the **live** DB, and
**(b) adversarially audit the new code** for fresh bugs. Companion to the full audit
`docs/AUDIT_2026-06-22.md` (`82af8bf`).

**Method.** Live anon-key probes against the cloud project (`lplsbfduankkpglyusjp`) for migration
state + RLS; static review of the new code; a 3-lens adversarial multi-agent pass (db-rpc /
auth-login / client-invariants), every finding independently verified (incl. live re-probe).
Tags: **FACT** = reproduced from code/live; **INFERENCE** = reasoned.

---

## 1. Fix verification (against the LIVE database)

| Fix | Status | Evidence |
| --- | --- | --- |
| **H1 — email-only login** | ✅ **VERIFIED CLOSED** | Live: `POST /rest/v1/rpc/resolve_login_email` → **404 PGRST202** (function gone; 6 alt param-names also 404). `username_available` → bare boolean. Client: `resolveLoginEmail`/`emailForIdentifier`/`looksLikeEmail` deleted (zero residual grep hits); sign-in is `signInWithPassword({email})` with `type=email`. No way to authenticate by username; no anon RPC returns PII. |
| **H2 — recurrence anchor (month-end)** | ✅ **VERIFIED CLOSED** | Live: `GET /rest/v1/tasks?select=recurrence_anchor` → **200** (column exists). Logic: `nthFromAnchor` computes each occurrence from the stable anchor → Jan 31 → Feb 28 → **Mar 31** (not Mar 28); anchor carried forward on spawn (`recurrence.ts:157`), set on create/edit. 32 recurrence tests green (incl. leap-year, the 30th, legacy no-anchor no-regression). |
| **H5 — atomic complete+spawn** | ⚠️ **ATOMICITY CLOSED; one grant discrepancy (FLAGGED)** | The RPC does the CAS done-UPDATE + next-occurrence INSERT in **one transaction** — a failed spawn rolls back the completion (no half-state; `completeTask.test.ts` proves it), and concurrent completes spawn **exactly once**. Forge-resistant: `id/status/timestamps` omitted from the INSERT column list (defaults win); `workspace_id/project_id/section_id` gated by `tasks_rw WITH CHECK` + the co-location guard. **BUT** the migration's `revoke all … from public` is **not in effect live** — see Finding **F1**. |
| **H6 — global mutation-error toast** | ✅ **CLOSED**, with one **fixed** gap | `MutationCache.onError` covers **every** `useMutation` (only deliberate opt-outs: `useUpdateProfile` `skipErrorToast` with its own inline error; `startSession` `noRetry`). Per-mutation `onError` rollback fires independently — rollback intact on all paths. The recurrence toast is gated on the RPC's authoritative `spawnedNext` (no false toast on a CAS miss). **Gap found & fixed:** the Retry action was offered for non-idempotent inserts — Finding **F4**. |

> **Honesty note on migration state.** This audit's live probes **confirm the prompt's assertion**:
> both `20260622140000` (DDL) and `20260622150000` are applied. My **prior** session's `CLAUDE.md`
> note marking them "PENDING" was **stale** and has been corrected. The single exception is the
> `complete_task` grant (F1) — applied as DDL, but the trailing `revoke/grant` never took effect.

---

## 2. New / residual findings

| # | Severity | Tag | Finding | Status |
| - | -------- | --- | ------- | ------ |
| **F1** | **Low** (def-in-depth) | FACT | `complete_task` is **anon-EXECUTABLE** — the migration's `revoke … from public` isn't live | ✅ **RESOLVED** — migration `20260622160000` (committed, run SQL to apply) |
| **F2** | **Medium** | FACT | Magic-link `signInWithOtp` omits `shouldCreateUser:false` → creates accounts + emails **arbitrary** addresses | ✅ **FIXED** (+ test) |
| **F3** | **Low** | FACT | Sign-in error mapping distinguishes "email not confirmed" vs "invalid credentials" (narrow enumeration oracle) | **FLAGGED** (auth copy/config) |
| **F4** | **Medium** | FACT/INF | Global toast's **Retry** offered for non-idempotent inserts → duplicate-row risk | **FIXED** (+ test) |
| **F5** | **Low** | FACT | Spawned next occurrence not added to optimistic cache (appears only after settle refetch) | **FLAGGED** (defer) |
| **F6** | **Low** | FACT | Recurring task in an **archived** project spawns into a non-navigable location ("no task ever invisible" technically violated) | **FLAGGED** (product; ties to orig. H4/M6) |
| **F7** | **Low** | FACT | Recurrence toast recomputes the next date (off-by-one across a local-midnight straddle) | **FLAGGED** (cosmetic, defer) |
| **F8** | **Low** | FACT | Signup surfaces "email already exists" (signup-side existence oracle) | **FLAGGED** (pre-existing, Supabase config) |
| — | Low | INF | Benign TOCTOU in `complete_task` not-found branch (concurrent delete → spurious P0002) | No action (harmless) |

### F1 — `complete_task` is anon-executable (migration `revoke` not in effect) · Low · FACT
- **Where:** `supabase/migrations/20260622140000_…sql:90-91` vs live behavior.
- **Evidence:** `POST /rest/v1/rpc/complete_task` as **anon** (random uuid) → **`500 P0002`** with the
  function's own message ("Task … not found or not accessible"), raised at line 59 — the body **ran**,
  so anon holds EXECUTE. (A revoked grant returns `403/42501` *before* the body; a missing function
  returns `404 PGRST202`.) Root cause: `create or replace function` does **not** reset PUBLIC's default
  EXECUTE, and the trailing `revoke/grant` block didn't take effect on the live DB.
- **Blast radius (precisely bounded):** RLS-contained. The function is `SECURITY INVOKER` + pinned
  `search_path=public`, so for anon (`auth.uid()` = null) the CAS UPDATE and the follow-up SELECT both
  match **0** rows and the spawn INSERT is **unreachable**. Verified live with random ids **and** a
  realistic `p_next` (valid-looking `workspace_id`, `title`, `recurrence_freq`): **zero writes, zero
  reads, NO existence oracle** (every id returns the identical message). Net effect of anon execute =
  a 500 response + trivial CPU. **Not exploitable.**
- **✅ RESOLVED (migration committed; run the SQL to apply):** added a dedicated idempotent
  migration `supabase/migrations/20260622160000_lock_complete_task_to_authenticated.sql`. Run in the
  SQL editor:
  ```sql
  revoke all on function public.complete_task(uuid, jsonb) from public;
  revoke all on function public.complete_task(uuid, jsonb) from anon;
  grant  execute on function public.complete_task(uuid, jsonb) to authenticated;
  ```
  Changes only the grant (not the body/RLS); `authenticated` keeps EXECUTE so the client RPC path is
  unaffected. Then re-probe: anon should get `42501`, not `500`. (Same root cause as audit **L1** — the
  other `SECURITY DEFINER` helpers are likewise PUBLIC-executable; harden together if desired.)

### F2 — Magic-link creates accounts for arbitrary emails · Medium · FACT
- **Where:** `src/features/auth/LoginPage.tsx` `handleMagicLink` — `signInWithOtp({ email, options:{ emailRedirectTo } })`, **no** `shouldCreateUser`.
- **Evidence (live-confirmed):** GoTrue defaults `shouldCreateUser=true`. `POST /auth/v1/otp` with an
  arbitrary nonexistent email (the exact shape the app sends) → **200** (project has
  `mailer_autoconfirm:true`, `disable_signup:false`) = create-and-email path. The same call with
  explicit `{create_user:false}` → **422 otp_disabled** — proving the one-line fix is effective. So the
  prominent "Email me a magic link" button is an **open unauthenticated email-relay/spam + ghost-account
  + weak-enumeration** vector. **Pre-existing** (identical OTP call before `3dbdd5c`) but never flagged,
  and now front-and-center on the email-only login.
- **✅ RESOLVED (applied):** `handleMagicLink` now passes `options.shouldCreateUser:false`, so the
  magic link only signs in **existing** users (account creation stays on the password signup form, which
  also collects the required username). The "no account" GoTrue error (`otp_disabled`) is detected by the
  tested pure helper `isNoAccountOtpError` (`src/features/auth/authErrors.ts`) and swallowed into the
  **same** neutral, non-enumerating confirmation shown on success — *"If an account exists for that email,
  a magic link is on its way."* — so the button can't probe who's registered; only genuine errors (rate
  limit/network) surface. Still **recommended (out of repo):** confirm Supabase rate-limit/CAPTCHA is on.

### F3 — Sign-in error oracle (confirmed-vs-invalid) · Low · FACT
- **Where:** `LoginPage.tsx:76-84`. `/email not confirmed/` → "confirm your email"; `/invalid login
  credentials/` → generic. GoTrue returns the former **only** for a registered-but-unconfirmed email,
  narrowly leaking existence of unconfirmed accounts.
- **Mitigation / why Low:** **dormant** under current config — live `/auth/v1/settings` shows
  `mailer_autoconfirm:true`, so there is effectively no unconfirmed state (the branch can't fire). The
  distinction also existed pre-`3dbdd5c` (raw GoTrue string). **FLAGGED** (don't silently change auth
  copy): if email-confirmation is ever turned on, collapse the unconfirmed case into the generic message
  and enable Supabase leak-protection.

### F4 — Retry on non-idempotent inserts can duplicate a row · Medium · FACT — **FIXED**
- **Where:** `src/lib/queryClient.ts` (Retry offered when `variables !== undefined && !meta.noRetry`)
  + the insert mutations. Only `startSession` carried `noRetry`; `createTask`/`addSubtask`/
  `createProject`/`createSection`/`createItem`/`markTaken` did not.
- **Risk:** if an INSERT commits server-side but the HTTP response is lost, `onError` fires, the toast
  shows **Retry**, and clicking it re-INSERTs the same payload → a duplicate row. (`toggleComplete` is
  **not** affected — its server-side CAS makes a retried complete idempotent.)
- **Fix (safe, contained — pure client `meta` flags; no RLS/auth/migration):** added
  `meta:{ noRetry:true }` to all six non-idempotent inserts (mirroring `startSession`), and extracted
  the gating into a tested `shouldOfferRetry(meta, variables)` helper.
  **Test:** `src/lib/queryClient.test.ts` (3 cases: replayable → Retry; `noRetry` → none; no variables → none).

### F5 / F7 — Spawn cache lag & toast date recompute · Low · FACT — FLAGGED (defer)
The atomic RPC returns only `{task, spawnedNext}` (no spawned row), so the next occurrence appears only
after the `onSettled` refetch (transient), and the toast **recomputes** the next date rather than reading
the inserted one (off-by-one only if the complete straddles local midnight). Both converge correctly;
no data loss. A clean fix widens the RPC to `returning` the spawned row + surfaces it — defer (touches the
RPC/migration).

### F6 — Recurring task in an archived project becomes non-navigable · Low · FACT — FLAGGED
`buildNextOccurrence` carries `project_id` unchanged. If that project is archived, the spawned occurrence
is excluded from Inbox (has a project), from Today/Overdue (future date), and archived projects render
**restore-only** with no link — reachable only by URL or un-archiving. Technically violates "no task ever
invisible." **Pre-existing** (project_id was always carried); H5 just makes the spawn more reliable. Ties
to the original audit's **H4/M6** — fix together (skip-spawn-into-archived, reparent to Inbox, or give
archived projects a read-only link). Product decision.

### F8 — Signup email-exists oracle · Low · FACT — FLAGGED
`signUp` failure → "An account with that email already exists." Inherent to Supabase signUp UX,
**unchanged** by `3dbdd5c`, far weaker than the closed H1 RPC (interactive, rate-limited, no PII mapping).
Mitigate via Supabase Auth config + generic copy if strict anti-enumeration is required.

---

## 3. Worst-case re-confirmation

- **RLS owner-only — ✅ FACT.** Anon `SELECT` on **all 12 tables** (`tasks`, `projects`, `sections`,
  `subtasks`, `profiles`, `workspaces`, `workspace_members`, `upgrade_intents`, `feature_intents`,
  `wellness_items`, `wellness_logs`, `focus_sessions`) → **`200 []`** (no cross-user read; profiles
  included → no PII). Anon `INSERT tasks` → **`42501`** RLS reject. Anon `DELETE`/`UPDATE` → `204`
  affecting **0** rows (RLS hides everything). Insert-only fake-door tables can't be read back.
- **Secrets — ✅ FACT.** Only the **public anon JWT** in source/`dist/` — grep of the built bundle for
  `service_role`/`sbp_`/`SUPABASE_SERVICE` = **none**.
- **XSS — ✅ FACT.** Zero `dangerouslySetInnerHTML`/`innerHTML`/`outerHTML`/`document.write`/`eval` in
  `src/` (only doc/comment mentions). No new user-HTML sink.
- **SPA rewrite — ✅ FACT.** `vercel.json` `/(.*) → /index.html` is the standard Vercel fallback; static
  assets resolve first, so real assets aren't swallowed. No regression.
- **Anon-callable function surface — ✅ FACT.** Returning anon functions: `username_available` (boolean).
  Others reachable by anon (`complete_task` → 500; `is_workspace_member`/`project_workspace`/… → `false`/
  `null`) return **no PII**. `handle_new_user` is correctly **not** exposed (404).

---

## 4. Runtime

- **Gates — ✅ green:** `typecheck`, `lint`, `test` (**25 files / 196 tests**), `build` all pass.
- **Live endpoints** respond correctly (auth/REST probes above).
- **Honest coverage gap:** a real **browser** session (console errors on each route; click-through of the
  live new-user path signup → onboarding → template → capacity) was **not** driven in this headless audit.
  Build + typecheck + the full test suite are green and the static/route config is sound, but a manual
  smoke (or `/verify`) is recommended before release. No broken routes/imports were found statically.

---

## 5. What was FIXED vs FLAGGED

**Fixed (safe, contained, with tests):**
- **F4** — `noRetry` on all 6 non-idempotent insert mutations + tested `shouldOfferRetry` gating helper.
- **F2** — magic-link `shouldCreateUser:false` + neutral non-enumerating copy + tested `isNoAccountOtpError`
  (commit after this doc).
- **F1** — dedicated idempotent migration `20260622160000_lock_complete_task_to_authenticated` (committed;
  run the SQL to apply live).
- **Docs** — corrected the stale migration-state in `CLAUDE.md`.

**Flagged (NOT auto-applied — touch Supabase Auth config or are product decisions):**
- **F3 / F8** — auth error/enumeration copy + Supabase Auth config decisions.
- **F5 / F6 / F7** — spawn cache/visibility & archived-project invariant (defer / product).

**Bottom line:** H1, H2, and H5's atomicity are genuinely closed (live-verified); H6 is closed and its
one gap fixed. **F2 is now fixed in code and F1 is closed by a committed migration** (apply its SQL). No
Critical/High exploitable issue remains; the residual F3/F5–F8 items are Low and flagged for product/
Supabase-config decisions.
