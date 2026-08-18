# FOLLOW-UP — Voice-note server/storage hardening

**Status: DEFERRED. Not shipped, not scheduled, fully designed.**

> **Voice notes today are a UI-GATED PRO FEATURE. Server and storage hardening is PENDING.**
> Nothing in this folder is deployed. The live behaviour is exactly what it was before PR #35:
> the recorder is gated in the client and on the save path, and the bucket's INSERT policy
> authorises on ownership alone.

---

## Why it was split out of PR #35

PR #35 shipped the count-limit enforcement, which is **complete**: proven on a real PostgreSQL with
the full migration chain, a real concurrency race, grandfathering, and direct-bypass denial.

Voice notes could not reach that bar, and the reason is structural rather than a matter of effort:
**the missing half is served by the Supabase Storage API, not by Postgres.** A disposable
PostgreSQL can prove what a *policy* does — and it did, see below — but it cannot execute
`createSignedUploadUrl` / `uploadToSignedUrl`, and it cannot run the journal E2E. Validating those
needs a full local Supabase stack, which needs Docker, which this machine does not have.

Shipping half of it would have been worse than shipping none:

| Half-shipped | Consequence |
| --- | --- |
| Endpoint only, client unchanged | A dead authenticated endpoint on a 12-function Vercel budget, enforcing nothing, because the direct upload path stays open |
| Policy only, client unchanged | **Recording breaks for everyone, including subscribers** |
| Client rewired, unvalidated | An untested change to the write path of a working feature, with no way to run its E2E |

**This change is atomic or it is nothing.**

---

## What is parked here, and what state it is in

| File | What it is | Proven? |
| --- | --- | --- |
| `journal-audio-upload-url.ts.txt` | The endpoint. Verifies the JWT, resolves entitlement from the database, mints a short-lived signed upload URL. **The server chooses the object path** from the verified JWT, so a token cannot be aimed at another user's folder. | ✅ 16 unit tests passed before parking |
| `journalAudioUploadUrl.test.ts.txt` | Those tests: Free → 403, no billing row → 403, unverified founding address → 403, unresolved entitlement → 503 and never a token, Pro → 200, founding → 200, path never caller-chosen, never `upsert`, rate limited, malformed date → 400 | ✅ |
| `20260818130000_journal_audio_pro_only.sql` | Drops `journal_audio_insert_own`, so a plain authenticated INSERT can no longer create an object. **Narrows** an ownership policy rather than adding a plan predicate — the commercial decision stays in the endpoint that mints the token, so this is not pricing-in-RLS | ✅ behaviour executed on real PostgreSQL |
| `journalAudioPolicy.db.test.ts.txt` | 7 DB tests proving the drop blocks a direct authenticated upload while leaving an existing recording **readable and deletable**, deleting nothing, and leaving the other three policies intact | ✅ |

The `.txt` suffixes are deliberate: they keep this out of `api/` (where Vercel counts every
top-level `.ts` as a deployable function) and out of the test globs, while leaving every file
readable and diffable. Restoring them is a rename.

`src/features/journal/audioKeyContract.test.ts` **stays in the shipping suite** and still compares
the live `audioKey` against the parked endpoint's key shape, so the design cannot drift away from
production while it waits.

---

## What was NEVER proven, and must be before this ships

1. `createSignedUploadUrl` actually mints a usable token for this bucket.
2. `uploadToSignedUrl` from the browser lands an object at the server-chosen path **after** the
   broad INSERT policy is gone.
3. `journal-audio.spec.ts` passes end to end.
4. Playback of a **pre-existing** recording still works for a Free user afterwards.

---

## The complete change, which must deploy as one unit

1. **Server entitlement verification** — parked, done.
2. **Signed upload authorization** — parked, done.
3. **Client rewire** — `uploadJournalAudio` calls the endpoint, then `uploadToSignedUrl`. Not written.
4. **Narrowed storage INSERT policy** — parked, done, behaviour proven in SQL.
5. **Local Supabase/Storage E2E** — see the E2E note below. Not written.
6. **Orphan cleanup** — **already live and already tested**: `save()` deletes the object it uploaded
   if the row write throws (`src/features/journal/orphanCleanup.test.ts`, which stays shipping).
7. **Existing audio preservation** — already live: PR #34 moved the player and delete button
   *outside* every entitlement branch, so a Free user with an old recording keeps it, plays it and
   can delete it. That is shipped and must not regress.

### The E2E problem, and its known fix

`journal-audio.spec.ts` grants Pro with `localStorage.todonado.plan`, which is a **dev-only** client
override the server cannot see and must never trust. The `e2e` CI job already runs a **full local
Supabase stack**; it exports `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` but not
`SUPABASE_SERVICE_ROLE_KEY`.

The fix is test infrastructure, never a weakening of server enforcement:

1. Export `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in the `e2e` job, exactly as the `supabase`
   job already does (`eval "$(supabase status -o env)"`).
2. Seed a real `billing` row (`plan='pro'`) for the throwaway E2E user, so the **server** sees Pro.

---

## Order of work when this is picked up

1. Get a local Supabase stack (Docker).
2. Restore the four parked files (a rename).
3. Rewire the client.
4. Fix the E2E entitlement as above.
5. Run: unit, api, `test:db`, **and** `journal-audio.spec.ts`.
6. Only then move the SQL into `supabase/migrations/` and deploy the whole thing together.

Until all of that is green, the entitlement table in `docs/ENTITLEMENTS.md` must keep saying
**client** for voice notes.
