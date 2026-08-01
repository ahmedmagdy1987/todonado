-- ============================================================================
--  Todonado — a REAL per-user quota on the journal-audio bucket
--  (audit FLAG-7, docs/AUDIT_2026-07-31_prelaunch2.md)
--
--  ⚠️  STATUS: COMMITTED, **NOT APPLIED**, and it carries a risk the length-cap
--      migration does not. READ SECTION 3 BEFORE RUNNING IT. See CLAUDE.md §7.
--
--  ── WHAT IS ALREADY TRUE WITHOUT THIS FILE ─────────────────────────────────
--  The bucket caps ONE object at 10 MB and restricts its MIME type, both
--  server-side, and four policies confine every object to `<user_id>/…`. What
--  none of that says is how MANY objects one account may have. Signup is free
--  and autoconfirmed, so an account can loop uploads into its own folder and
--  consume unbounded paid storage. Every one of those requests is RLS-legal and
--  owner-scoped, which is precisely why nothing refuses it: the policy is about
--  WHOSE folder, not how big.
--
--  `uploadJournalAudio` already refuses at 200 MB. That is a CLIENT check, and
--  the client is assumed hostile: anyone holding their own access token can call
--  the storage API directly and skip it. This file is the half that cannot be
--  skipped.
--
--  ── WHY A TRIGGER AND NOT A POLICY ─────────────────────────────────────────
--  A policy is the natural home for "may this row exist", and it is the wrong
--  tool here for one reason: a `with check` expression is evaluated against the
--  row on its way in, and the incoming object's SIZE is not reliably in that row
--  yet. Resumable (TUS) uploads create the object row first and fill
--  `metadata->>'size'` in afterwards, so a policy that read the size would read
--  NULL, treat it as zero, and wave through exactly the upload path an abuser
--  would reach for. A trigger can fire on BOTH events, which is what closes it.
--
--  ── WHAT IT ENFORCES ───────────────────────────────────────────────────────
--  Total bytes across one user's folder in `journal-audio` may not exceed
--  209715200 (200 MB). Enforced on INSERT and again on UPDATE OF metadata, so
--  the resumable path is checked at the moment the true size becomes known.
--
--  Strictly greater-than, matching `exceedsQuota` in useJournal.ts: landing
--  exactly ON the limit is allowed by both halves. `journalAudioQuota.test.ts`
--  pins this file's number to the client's constant, so they cannot drift.
--
--  ── WHAT IT COSTS ──────────────────────────────────────────────────────────
--  One aggregate over the caller's own folder per upload. The scan is a prefix
--  match on `name` rather than `storage.foldername(name)[1] = …` SPECIFICALLY so
--  the existing unique index on (bucket_id, name) can serve it — the array form
--  reads better and would force a sequential scan of every object in the bucket,
--  on every upload, forever. At the 200 MB cap a folder holds a few hundred
--  rows, so this is microseconds; at ten thousand users it is still microseconds,
--  because it never looks outside one folder.
--
--  Nothing is counted or cached, so nothing can drift: deleting a recording
--  frees the space immediately with no bookkeeping, the same discipline the
--  points score and the challenge bars already follow.
--
--  The real cost is UX, and it is why the client check stays. A rejection here
--  surfaces through storage-api as a generic upload failure carrying this
--  message, not as the friendly "Your voice notes are using 173 MB of 200 MB"
--  the client produces. Good path: the client refuses first and explains. This
--  is the backstop, and a backstop is allowed to be blunt.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. THE LIMIT, IN ONE PLACE
--
--    A function rather than a literal buried in the trigger body, so raising it
--    is a one-line change and so `journalAudioQuota.test.ts` has a single thing
--    to pin against src/features/journal/api/useJournal.ts.
-- ---------------------------------------------------------------------------
create or replace function public.journal_audio_quota_bytes()
returns bigint
language sql
immutable
as $$ select 209715200::bigint $$;  -- 200 MB = 200 * 1024 * 1024

comment on function public.journal_audio_quota_bytes() is
  'Per-user byte cap on the journal-audio bucket. Mirrors JOURNAL_AUDIO_QUOTA_BYTES in src/features/journal/api/useJournal.ts; journalAudioQuota.test.ts fails if they disagree.';


-- ---------------------------------------------------------------------------
-- 2. THE TRIGGER FUNCTION
--
--    SECURITY DEFINER, deliberately. The sum has to be the TRUE total, and a
--    quota that reads zero because it could not see the rows is not a quota, it
--    is a formality. Under RLS this happens to work today (the select policy
--    grants a user their own folder), but "happens to work given the current
--    policy set" is not a property to bet a spending limit on.
--
--    It reads nothing beyond one folder's sizes and returns no data to any
--    caller, so definer rights buy exactly the guarantee and no new surface.
--    `search_path` is pinned so the definer context cannot be steered by a
--    caller-set path.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_journal_audio_quota()
returns trigger
language plpgsql
security definer
set search_path = storage, public, pg_temp
as $$
declare
  folder   text;
  existing bigint;
  incoming bigint;
  limit_b  bigint := public.journal_audio_quota_bytes();
begin
  -- Every other bucket is none of this trigger's business. First statement on
  -- purpose: a shared table means a future bucket inherits whatever runs here.
  if new.bucket_id is distinct from 'journal-audio' then
    return new;
  end if;

  folder := (storage.foldername(new.name))[1];

  -- An object with no folder cannot be attributed to anyone. The insert policy
  -- already rejects it (it requires the first segment to equal auth.uid()); size
  -- is this trigger's job and authorisation is not, so it declines to guess.
  if folder is null then
    return new;
  end if;

  incoming := coalesce((new.metadata ->> 'size')::bigint, 0);

  select coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0)
    into existing
    from storage.objects o
   where o.bucket_id = 'journal-audio'
     -- Prefix match, NOT foldername(): see the header. `folder` is a uuid text
     -- from the object's own key, so there is no wildcard to escape, but the
     -- LIKE pattern is still built from it rather than from user input.
     and o.name like folder || '/%'
     -- On UPDATE the row is already in the table and would be counted twice:
     -- once in this sum at its OLD size and once as `incoming` at its new one.
     and o.id is distinct from new.id;

  if existing + incoming > limit_b then
    raise exception
      'Journal audio quota reached: % of % bytes already stored for this account.',
      existing, limit_b
      using
        errcode = 'PT413',
        hint = 'Delete an older recording, or save the entry as text.';
  end if;

  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. THE TRIGGERS
--
--    ⚠️  THIS IS THE PART THAT MAY REFUSE TO APPLY.
--
--    `storage.objects` is owned by `supabase_storage_admin`, not by the role
--    `supabase db push` connects as, and creating a trigger requires ownership.
--    On most projects the migration role is a superuser-equivalent and this
--    simply works; on a project where Supabase has tightened the storage schema
--    it fails with:
--
--        ERROR: must be owner of table objects
--
--    That error means THIS FILE could not be applied. It does not roll back the
--    length-cap migration alongside it (each file is its own transaction) and it
--    leaves the database exactly as it was. If you hit it, the fallbacks are an
--    Edge Function in front of uploads, or a scheduled job that sweeps folders
--    over the cap — both strictly worse than a trigger, which is why this is
--    tried first.
--
--    BEFORE, not AFTER: the row must never be written at all. An AFTER trigger
--    that raised would also roll back, but only after the storage backend had
--    already accepted the bytes.
-- ---------------------------------------------------------------------------
drop trigger if exists enforce_journal_audio_quota_insert on storage.objects;
create trigger enforce_journal_audio_quota_insert
  before insert on storage.objects
  for each row
  execute function public.enforce_journal_audio_quota();

-- The resumable-upload path: the row exists before its size is known, and this
-- is the moment the truth arrives. Without this trigger the INSERT check above
-- is a formality for any caller that uses TUS.
drop trigger if exists enforce_journal_audio_quota_update on storage.objects;
create trigger enforce_journal_audio_quota_update
  before update of metadata on storage.objects
  for each row
  execute function public.enforce_journal_audio_quota();


-- ---------------------------------------------------------------------------
-- 4. VERIFYING IT AFTER APPLYING
-- ---------------------------------------------------------------------------
--  The honest test is an upload, not a query. Signed in as a real user:
--
--    * upload a recording normally                    -> succeeds
--    * select sum((metadata->>'size')::bigint)
--        from storage.objects
--       where bucket_id = 'journal-audio'
--         and name like auth.uid()::text || '/%';     -> the number it enforces
--
--  To prove it BITES without uploading 200 MB, temporarily lower the limit:
--
--    create or replace function public.journal_audio_quota_bytes()
--    returns bigint language sql immutable as $q$ select 1::bigint $q$;
--
--  ...attempt one upload (it must fail), then restore it by re-running section 1
--  of this file. A quota nobody has seen refuse anything is an assumption.
--
--  Then update CLAUDE.md §7: name this file in the applied list, remove it from
--  the pending box, and update FLAG-7 in the audit from PARTLY CLOSED to CLOSED.
-- ---------------------------------------------------------------------------
