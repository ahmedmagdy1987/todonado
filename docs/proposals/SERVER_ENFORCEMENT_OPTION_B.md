# Option B server enforcement — review, design, and two blockers

**Verified 2026-08-18** against production through the read-only Supabase MCP
(`supabase_read_only_user`, `transaction_read_only = on`, 37 migrations, latest
`20260808120000`) and by tracing every write path in source. **No production writes.**

> **Verdict: the design is sound, and it must not be applied yet.** Two prerequisites are unmet,
> and each on its own would make applying it harmful rather than merely premature.

---

## 1. 🛑 BLOCKER ONE — the database cannot tell who is Pro

This is the architectural one, and the brief predicted it exactly.

```
total_users   16
billing_rows   0        <-- public.billing is EMPTY
pro_rows       0
free_rows      0
```

`public.billing` has **no rows at all**. Of the two addresses in `FOUNDING_EMAILS`, only
`ahmedkassim17777@gmail.com` is registered, and it has **no billing row** (`has_billing_row: false`,
`plan: null`).

So the only thing that makes anyone Pro today is a **TypeScript email allowlist**
(`src/features/billing/planCore.ts`) plus the dev-only localStorage override. The database can see
neither.

**Consequence:** a `BEFORE INSERT` trigger resolving entitlement from `billing` classifies **all 16
users, including the owner's own founding account, as Free**, and caps them at 5 templates / 5 vision
goals / 3 mind maps / 3 quit habits. That is precisely the "accidentally treat legitimate
founding/manual Pro users as Free" outcome §5 and §12 say to block on.

### The two ways out, and why neither is takeable in this turn

| | What it is | Why not now |
| --- | --- | --- |
| **Duplicate the allowlist in SQL** | Copy the two emails into `effective_plan` | **Forbidden.** Creates two conflicting definitions of Pro, in two languages, with no drift protection. This is the exact failure the entitlement rework was undertaken to end. |
| **Seed billing rows for founding accounts** | One `insert … on conflict do update` | **Correct, and not mine to run.** It is a data migration into `billing`, which §5 says not to execute without review and §10 excludes ("no billing-row changes"). |

### The prerequisite, ready for approval

`planCore.ts` already carries the SQL and has done since the allowlist was written:

```sql
insert into public.billing (user_id, plan, subscription_status)
select id, 'pro', 'founding' from auth.users where email = '<address>'
on conflict (user_id) do update set plan = 'pro';
```

**This is additive**, touches no other user, and is exactly what the file's own header says the real
fix is. Once every founding account holds a row, `billing` becomes genuinely authoritative, the
allowlist can be emptied, and this trigger becomes safe. **Order of operations is: seed the rows →
verify → then apply the trigger.** Doing it the other way round caps the owner.

---

## 2. 🛑 BLOCKER TWO — none of this has been executed

There is **no Docker and no local Postgres** on this machine (`docker: command not found`, no `psql`,
no `pg_ctl`, nothing listening on 5432 or 54322). The Supabase CLI is installed but `supabase start`
needs Docker.

So the trigger has never run. **Untested and unverifiable here:** the advisory lock, the concurrent
boundary case, the `format`/`execute` dynamic count, the PostgREST HTTP mapping of the error, and
every one of the tests §11–§13 require.

Per §18 this is reported rather than papered over. **Shipping unvalidated enforcement into the write
path of four product features is a worse outcome than leaving the caps client-side for another
week.**

The SQL is therefore parked at `docs/proposals/20260818120000_free_count_limits.sql` and **not** in
`supabase/migrations/`. CLAUDE.md §7 records that an unapplied file in that folder is an invitation
to run `supabase db push`, and that commit `b2ee68c` exists because documentation once made that
mistake reachable.

---

## 3. Every unenforced limit, traced from source

Not inferred from the UI. Each row below was confirmed by reading the mutation that performs the
write.

| Feature | Table | Write path | Client check | Server check | RLS | Direct write possible | Current bypass | Required enforcement |
| --- | --- | --- | --- | --- | --- | :---: | --- | --- |
| Personal templates | `user_templates` | `supabase.from('user_templates').insert()` | `limitState('personalTemplates')` | none | owner-only, no plan predicate | **yes** | any `insert` past 5 | trigger ✅ designed |
| Vision goals | `vision_cards` | `supabase.from('vision_cards').insert()` | `limitState('visionCards')` | none | owner-only | **yes** | any `insert` past 5 | trigger ✅ designed |
| Mind maps | `mind_maps` | `supabase.from('mind_maps').insert()` | `limitState('mindMaps')` | none | owner-only | **yes** | any `insert` past 3 | trigger ✅ designed |
| Quit habits | `quit_habits` | `supabase.from('quit_habits').insert()` | `limitState('quitHabits')` | none | owner-only | **yes** | any `insert` past 3 | trigger ✅ designed |
| Active challenges | `user_challenges` | `supabase.from('user_challenges').insert()` | `limitState('activeChallenges')` | none | owner-only | **yes** | any `insert` | ❌ **not enforceable** — see §4 |
| Voice notes | `storage.objects` **then** `journal_entries` | `storage.from('journal-audio').upload()` | write-path guard (PR #34) | none | ownership by path segment | **yes**, and **storage too** | direct upload | ❌ **not solved** — see §5 |

All five table inserts go **browser → PostgREST**. There is no serverless function in the path of any
of them, which is why a trigger is the right instrument and a proxy would be a rewrite.

---

## 4. Why `activeChallenges` cannot be a trigger

The client counts challenges whose **derived phase** is active:

```ts
const activeCount = attempts.filter((a) => a.phase === 'active').length
// phaseOf(row, challenge, progress, todayStr):
//   status === 'abandoned'            -> 'left'
//   status === 'completed' || done    -> 'done'
//   todayStr > lastDayOf(started_at, challenge.durationDays) ? 'ended' : 'active'
```

That derivation needs three things the database does not have:

1. **`challenge.durationDays`** — lives in the TypeScript catalog (`challenges.ts`), per challenge.
2. **`progress.done`** — computed over tasks, focus sessions, quit habits and journal days. There is
   deliberately **no progress column**; `challengeMigration.test.ts` asserts its absence, because a
   stored counter would drift.
3. **the user's local calendar day** — the window is counted in local days, not UTC.

A trigger counting `status = 'active'` instead would be **stricter than the UI**: a challenge whose
window has elapsed is `phase = 'ended'` in the app but still `status = 'active'` in the row, so the
trigger would refuse joins the app had just told the user were available.

**Enforcing this in SQL means reimplementing a feature in SQL.** It stays client-side, and the
enforcement table in `docs/ENTITLEMENTS.md` says so rather than implying otherwise.

---

## 5. Voice notes — traced, and NOT solved

### The actual sequence

```
record (in memory)
  -> supabase.storage.from('journal-audio').upload(path, blob)   <-- object lands FIRST
  -> saveEntry.mutateAsync({ audio_path, audio_seconds })        <-- row written SECOND
  -> removeJournalAudio(previousPath)                            <-- old object cleaned up
```

The upload/row order is deliberate and correct for its own reason (a failure in the middle deletes
the object just uploaded, so a failed save never leaves a file nobody can reach and everybody pays
for). But it means **a trigger on `journal_entries` rejects the row after the object is already
stored** — leaving an orphaned, unauthorised object in a paid bucket. §9 names that outcome
explicitly: it is *not* complete enforcement.

### The storage policies, read from production

```
journal_audio_insert_own   INSERT   bucket_id = 'journal-audio'
                                    AND (storage.foldername(name))[1] = auth.uid()::text
```

**Ownership only. No plan predicate.** Any authenticated Free session can upload directly, whatever
the app does.

### Why the obvious fixes are all wrong here

| Approach | Verdict |
| --- | --- |
| Trigger on `storage.objects` | **No.** Owned by `supabase_storage_admin`, not `postgres`; it already carries four triggers of its own. Supabase does not document this as a supported extension point, and §9 forbids touching managed internals unverified. |
| Add a plan predicate to the storage RLS policy | **No.** That is encoding pricing into an ownership policy, which §3 forbids in as many words. |
| Put all six writes behind serverless proxies | **No.** §9 forbids dragging the other five along because voice notes need it. |

### The remaining candidate, designed but not built

**A narrow server-mediated upload.** `api/journal-audio-upload-url.ts` verifies the JWT, resolves
entitlement with the existing `checkFeature(entitlement, 'journal.voiceNotes')`, and returns a
short-lived **signed upload URL** (`storage.createSignedUploadUrl`) scoped to `<user_id>/<file>`. The
client swaps `upload()` for `uploadToSignedUrl()`.

To make it airtight the direct path must also close, by **narrowing** `journal_audio_insert_own` so a
plain authenticated INSERT is no longer permitted and only a signed token writes. That is a
*restriction* of an ownership policy, not a price encoded into one — the commercial decision stays in
the function that decides whether to issue the token.

**Not built in this PR**, for three reasons worth stating: it changes the write path of a working
feature; it introduces a `SUPABASE_SERVICE_ROLE_KEY` dependency where none exists today; and it
cannot be tested here. It also needs its own review, because getting it wrong breaks recording
outright.

**Reported as the remaining blocker rather than pretended solved**, as §9 requires.

---

## 6. The design, for when the prerequisites are met

Full SQL: `docs/proposals/20260818120000_free_count_limits.sql`.

| | |
| --- | --- |
| **Migration name** | `20260818120000_free_count_limits` |
| **Objects created** | 2 functions, 4 triggers |
| **Functions** | `public.effective_plan(uuid)` · `public.enforce_free_count_limit()` |
| **Triggers** | `enforce_free_limit` BEFORE INSERT on `user_templates`, `vision_cards`, `mind_maps`, `quit_habits` |
| **Tables touched** | none altered. Four gain a trigger; no column, constraint or policy changes |
| **Storage objects touched** | **no** |
| **RLS changed** | **no** — the file contains no `create/alter/drop policy` at all, asserted by test |
| **Trust source** | `public.billing` only. No client write path exists to it (SELECT-own RLS, no write policy, writes only via SECURITY DEFINER Stripe functions), so a caller cannot state its own plan. The trigger never reads a plan or entitlement flag off the inserted row |
| **Locking** | `pg_advisory_xact_lock(hashtext(namespace), hashtext(user_id))`, copied from the shipped `calendar_sources_enforce_cap`, whose two concurrency cases are already covered by `db-tests/calendarSourcesGuard.db.test.ts` and were confirmed to FAIL without the lock |
| **Failure mode** | `check_violation` (23514), message `free_limit_reached:<feature>:<cap>`, hint `<feature>`. The client maps the prefix to the existing `ProUpgradeNotice`. A bespoke SQLSTATE was considered and rejected: PostgREST's HTTP mapping for a custom class could not be verified without a local stack |
| **Data impact** | **none.** No row is read for rewriting, updated, deleted, hidden or archived. No backfill |
| **Rollback** | 4 `drop trigger` + 2 `drop function`. Restores the previous behaviour exactly; no data was ever touched, so there is nothing to restore |

### Grandfathering

The comparison is `n >= cap` on **INSERT only**. An account already above a limit is refused a *new*
row and keeps every row it has — reads, edits and deletes all continue to work, because no UPDATE or
DELETE hook exists. Asserted by test: the file contains no `before update` / `before delete` /
`after delete`.

In practice nobody is over any limit anyway: PR #34 **raised** every Free number and lowered none.

### Why one generic function and not four

`enforce_free_count_limit()` is parameterised by trigger arguments (`feature`, `cap`) and reads the
table from `tg_table_name`, so one body serves all four. Four copies of `if count >= N` is the shape
the brief rules out, and it is how the client half drifted in the first place.

---

## 7. Drift protection (§14)

A cap cannot be shared across a language boundary; it has to be written twice. The duplication is
allowed and the **drift** is not.

`src/features/billing/sqlLimitContract.test.ts` reads the SQL and asserts every trigger argument
equals `ENTITLEMENTS.free.limits`. Raise a limit in one place and the build goes red until the other
follows. It also pins the safety properties: no RLS statement, no storage reference, no destructive
verb, no trust in caller-supplied plan, the advisory lock present, INSERT-only, the error contract,
and the rollback.

**Negative control run:** changing the SQL cap for `mindMaps` from 3 to 9 fails the suite with
`expected 9 to be 3`.

This is the same technique `personalCaps.test.ts`, `quitCaps.test.ts` and `mindMapCaps.test.ts`
already use for the size/shape CHECKs, applied to the caps that have a price attached.

---

## 8. What has to happen next, in order

1. **Approve and run the founding-Pro seed** into `billing` (SQL in §1). Owner, real terminal.
2. **Verify** those rows exist and `effective_plan` returns `'pro'` for them.
3. Move the SQL into `supabase/migrations/`, update the one path in the contract test.
4. **Run the DB tests on a real connection** — the six §11 cases plus the concurrency boundary and
   the founding-Pro case. This needs Docker or CI.
5. Only then apply. `activeChallenges` and voice notes remain client-side and are documented as such.
