-- ============================================================================
--  Todonado — journal_entries (+ the private journal-audio bucket)
--
--  The end-of-day review: what got done, what could go better, and anything
--  else. One entry per LOCAL DAY, which is what `unique (user_id, entry_date)`
--  enforces — a journal with two Tuesdays is not a journal, and making the
--  database say so means the client never has to guess which one is real.
--
--  THE ENTRY IS ONE TEXT COLUMN, NOT THREE. The form is prompt-guided, but the
--  prompts are scaffolding for writing, not a schema: people write around them,
--  paste in half a paragraph, or ignore two of the three. Three columns would
--  bake today's prompts into the database and make changing them a migration.
--  The client serialises the sections into one document with stable headings and
--  parses them back defensively (`parseEntry` in journal.ts) — an entry it
--  cannot recognise is shown as free notes rather than lost, so text written by
--  an older build, a future build, or a paste from somewhere else always survives.
--
--  ── AUDIO ───────────────────────────────────────────────────────────────────
--  Voice notes live in Storage, not in this table. `audio_path` is the object
--  key and `audio_seconds` is a duration for the UI to show before anything is
--  fetched — a player that cannot say how long a clip is until it has downloaded
--  it is a bad player, and this is one small integer instead.
--
--  THE BUCKET IS PRIVATE AND MUST STAY PRIVATE. A journal is the most sensitive
--  thing in this app; a public bucket would make every recording readable by
--  anyone who guessed a URL. Playback therefore goes through short-lived SIGNED
--  URLs, and the bucket is created with `public = false` — re-asserted on
--  conflict, so re-running this file also REPAIRS a bucket someone flipped
--  public by hand in the dashboard.
--
--  Object ownership is enforced by PATH: every key is `<user_id>/<file>`, and
--  each policy checks `(storage.foldername(name))[1] = auth.uid()::text`. That is
--  the standard Supabase per-user-folder recipe, and it is why the client must
--  never be free to choose the whole key.
--
--  A size limit and a MIME allow-list are set on the bucket itself, so the cap
--  holds even if a client forgets to check — the browser's own 10 MB / 5 minute
--  guards are a courtesy, this is the enforcement.
--
--  OWNER-ONLY, mirroring vision_cards / mind_maps / user_challenges.
--  Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.journal_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- The LOCAL day the entry is about. A date, not a timestamp: "which day is
  -- this about" is a calendar question, and the client already works in local
  -- day keys everywhere else (streak, points, challenges).
  entry_date    date not null,
  -- The whole entry, sections and all. See the header.
  text          text,
  -- Storage object key, always `<user_id>/<something>`. Null = no recording.
  audio_path    text,
  -- Whole seconds, so the UI can show a duration without fetching the audio.
  audio_seconds integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists journal_entries_user_id_idx on public.journal_entries (user_id);

-- ---- size + shape guards (added separately so re-running is safe) ----------
do $$
begin
  -- One entry per day. The client edits rather than inserts a second.
  if not exists (select 1 from pg_constraint where conname = 'journal_entries_one_per_day') then
    alter table public.journal_entries
      add constraint journal_entries_one_per_day
      unique (user_id, entry_date);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'journal_entries_text_len') then
    alter table public.journal_entries
      add constraint journal_entries_text_len
      check (text is null or char_length(text) <= 8000);
  end if;

  -- 300 seconds = the 5-minute cap the recorder enforces. Pinned by a test.
  if not exists (select 1 from pg_constraint where conname = 'journal_entries_audio_seconds') then
    alter table public.journal_entries
      add constraint journal_entries_audio_seconds
      check (audio_seconds is null or (audio_seconds >= 0 and audio_seconds <= 300));
  end if;

  -- A path and a duration travel together: one without the other is a player
  -- that cannot play, or a duration for nothing.
  if not exists (select 1 from pg_constraint where conname = 'journal_entries_audio_shape') then
    alter table public.journal_entries
      add constraint journal_entries_audio_shape
      check ((audio_path is null) = (audio_seconds is null));
  end if;
end $$;

-- updated_at trigger (reuses the shared function from the initial schema).
drop trigger if exists set_updated_at on public.journal_entries;
create trigger set_updated_at before update on public.journal_entries
  for each row execute function public.set_updated_at();

alter table public.journal_entries enable row level security;

-- ---- RLS: owner-only, full CRUD --------------------------------------------
drop policy if exists journal_entries_select_own on public.journal_entries;
create policy journal_entries_select_own on public.journal_entries
  for select using (user_id = auth.uid());

drop policy if exists journal_entries_insert_own on public.journal_entries;
create policy journal_entries_insert_own on public.journal_entries
  for insert with check (user_id = auth.uid());

drop policy if exists journal_entries_update_own on public.journal_entries;
create policy journal_entries_update_own on public.journal_entries
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists journal_entries_delete_own on public.journal_entries;
create policy journal_entries_delete_own on public.journal_entries
  for delete using (user_id = auth.uid());

-- ============================================================================
--  Storage: the private journal-audio bucket
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'journal-audio',
  'journal-audio',
  false,
  10485760, -- 10 MB, matching the client's cap
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
)
on conflict (id) do update
  -- Re-assert rather than ignore: re-running this file REPAIRS a bucket that
  -- was made public, or had its limits removed, in the dashboard.
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---- Storage RLS: the object's first path segment must be the caller --------
--
--  `storage.foldername(name)` splits the key on '/', so `[1]` is the folder the
--  object sits in. Requiring it to equal auth.uid() is what makes one user's
--  recordings unreachable to another even though every object lives in the same
--  bucket. There is no anon grant of any kind.

drop policy if exists journal_audio_select_own on storage.objects;
create policy journal_audio_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'journal-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists journal_audio_insert_own on storage.objects;
create policy journal_audio_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'journal-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists journal_audio_update_own on storage.objects;
create policy journal_audio_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'journal-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'journal-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists journal_audio_delete_own on storage.objects;
create policy journal_audio_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'journal-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
