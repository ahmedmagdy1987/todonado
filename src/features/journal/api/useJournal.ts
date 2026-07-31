import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type { JournalEntry, JournalEntryPatch, NewJournalEntryInput } from '@/types/database'
import { assertRealIds } from '@/lib/optimistic'

/** PostgREST / Postgres codes for "that table isn't there". */
const TABLE_MISSING = new Set(['PGRST205', '42P01'])

export const AUDIO_BUCKET = 'journal-audio'
/** How long a playback link lives. Long enough to listen, short enough to matter. */
const SIGNED_URL_SECONDS = 60 * 60

/**
 * Owner-only journal entries (RLS: user_id = auth.uid()).
 *
 * DEGRADES GRACEFULLY WHEN THE TABLE IS ABSENT, the same posture as
 * `useVisionCards` / `useMindMaps` / `useUserChallenges`. This one matters more
 * than most: the challenges page asks whether the journal is available in order
 * to decide whether to offer the journal challenge at all, so "unavailable" has
 * to be a real answer rather than an exception.
 */
export function useJournalEntries(userId: string) {
  return useQuery({
    queryKey: qk.journalEntries(userId),
    enabled: !!userId,
    retry: false,
    queryFn: async (): Promise<{ rows: JournalEntry[]; available: boolean }> => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('entry_date', { ascending: false })
      if (error) {
        return { rows: [], available: !TABLE_MISSING.has(error.code) }
      }
      return { rows: (data ?? []) as JournalEntry[], available: true }
    },
  })
}

/**
 * A playback link for one recording.
 *
 * SIGNED, NEVER PUBLIC. The bucket is private (see the migration), so this is
 * the only way to hear a clip — and the link expires. Keyed by path so two
 * entries never share a URL, and `staleTime` is comfortably under the signature
 * lifetime so a link is refreshed before it can die mid-listen.
 */
export function useAudioUrl(path: string | null) {
  return useQuery({
    queryKey: qk.journalAudio(path ?? ''),
    enabled: !!path,
    retry: false,
    staleTime: (SIGNED_URL_SECONDS - 300) * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from(AUDIO_BUCKET)
        .createSignedUrl(path!, SIGNED_URL_SECONDS)
      if (error) return null
      return data?.signedUrl ?? null
    },
  })
}

export function useJournalMutations(userId: string) {
  const qc = useQueryClient()
  const key = qk.journalEntries(userId)
  type Cache = { rows: JournalEntry[]; available: boolean }

  const settle = () => void qc.invalidateQueries({ queryKey: key })
  const setRows = (u: (p: JournalEntry[]) => JournalEntry[]) =>
    qc.setQueryData<Cache>(key, (p) => ({ available: p?.available ?? true, rows: u(p?.rows ?? []) }))

  /**
   * Save today's entry — one call for both "first time" and "editing".
   *
   * An UPSERT on the (user_id, entry_date) unique key rather than a read-then-
   * insert-or-update: the read would be a race, and a second tab could turn a
   * legitimate edit into a 23505 the user has no way to interpret. The database
   * already knows there is one entry per day; this asks it to enforce that
   * rather than re-deriving it in the client.
   */
  const saveEntry = useMutation({
    mutationFn: async (input: NewJournalEntryInput) => {
      assertRealIds(input)
      const { data, error } = await supabase
        .from('journal_entries')
        .upsert(
          {
            user_id: userId,
            entry_date: input.entry_date,
            text: input.text,
            audio_path: input.audio_path ?? null,
            audio_seconds: input.audio_seconds ?? null,
          },
          { onConflict: 'user_id,entry_date' },
        )
        .select('*')
        .single()
      if (error) throw error
      return data as JournalEntry
    },
    onSuccess: (row) => {
      setRows((p) => [row, ...p.filter((e) => e.id !== row.id && e.entry_date !== row.entry_date)])
    },
    onSettled: settle,
  })

  const updateEntry = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: JournalEntryPatch }) => {
      // Guards the FKs a PATCH can carry, not just the row it addresses.
      assertRealIds(patch)
      const { data, error } = await supabase
        .from('journal_entries')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as JournalEntry
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Cache>(key)
      setRows((p) => p.map((e) => (e.id === id ? { ...e, ...patch } : e)))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: settle,
  })

  /**
   * Delete an entry AND its recording.
   *
   * The audio object goes FIRST and its failure is not fatal. Order matters: if
   * the row went first and the object delete then failed, the key would be gone
   * from the database and the file would be orphaned in the bucket forever, paid
   * for and unreachable. This way the worst case is a row that still exists,
   * which the user can simply delete again.
   */
  const deleteEntry = useMutation({
    mutationFn: async (entry: JournalEntry) => {
      if (entry.audio_path) {
        const { error } = await supabase.storage.from(AUDIO_BUCKET).remove([entry.audio_path])
        // A missing object is a success for our purposes — the goal is that it
        // is not there afterwards.
        if (error && !/not found/i.test(error.message)) throw error
      }
      const { error } = await supabase.from('journal_entries').delete().eq('id', entry.id)
      if (error) throw error
      return entry.id
    },
    onMutate: async (entry) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Cache>(key)
      setRows((p) => p.filter((e) => e.id !== entry.id))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: settle,
  })

  return { saveEntry, updateEntry, deleteEntry }
}

/**
 * Put a recording in the private bucket.
 *
 * The key is chosen by `audioKey`, never by the caller — the storage policy
 * requires the first path segment to be the caller's own id, so a key built any
 * other way is refused by the database rather than quietly stored somewhere
 * readable.
 */
export async function uploadJournalAudio(path: string, blob: Blob): Promise<void> {
  /*
   * THE QUOTA IS CHECKED HERE, at the one place an object is created, rather
   * than at the button that starts a recording. A check on the button is a
   * suggestion; a check on the write is a rule, and it also covers the paths
   * that never touch that button.
   */
  const userId = path.split('/')[0] ?? ''
  if (userId) {
    const usage = await journalAudioUsage(userId)
    if (exceedsQuota(usage, blob.size)) throw new JournalAudioQuotaError(usage)
  }

  const { error } = await supabase.storage.from(AUDIO_BUCKET).upload(path, blob, {
    contentType: blob.type || 'audio/webm',
    // Never overwrite: each recording gets a fresh key, so an upsert here could
    // only ever mean a collision we would rather hear about.
    upsert: false,
  })
  if (error) throw error
}

/** Remove one recording, tolerating one that is already gone. */
export async function removeJournalAudio(path: string): Promise<void> {
  const { error } = await supabase.storage.from(AUDIO_BUCKET).remove([path])
  if (error && !/not found/i.test(error.message)) throw error
}

/**
 * Delete EVERY recording this user owns, and report how many went.
 *
 * ── WHY ACCOUNT DELETION NEEDS THIS ──────────────────────────────────────────
 * `delete_own_account()` removes the `auth.users` row and the whole FK graph
 * goes with it — including `journal_entries`. Storage does NOT follow. Objects
 * live in `storage.objects`, whose link to a user is `owner`, and that has
 * never been an ON DELETE CASCADE; the audio itself is only removed when the
 * object row is deleted through the storage API.
 *
 * So the row that NAMED a recording vanished while the recording stayed in the
 * bucket — the single most sensitive thing this app stores, kept after the
 * account that owned it was gone, and still counted against the storage bill.
 * Nothing surfaced it, because the entry pointing at it had been deleted.
 *
 * This runs from the CLIENT, before the RPC, deliberately: the user still holds
 * a session, and the bucket's delete policy already grants them exactly their
 * own `<user_id>/` folder. Doing it server-side would mean a new migration and
 * a service-role reader over the most private data in the product, to achieve
 * the same erasure.
 *
 * Paginated: `list` caps a page, and a user who journals daily for a year has
 * more recordings than one page holds. Stopping at the first page would leave
 * exactly the oldest recordings behind, which is the wrong half to keep.
 */
export async function removeAllJournalAudio(userId: string): Promise<number> {
  return removeAllAudioIn(supabase.storage.from(AUDIO_BUCKET), userId)
}

/** The minimal slice of the storage client this needs (keeps it unit-testable). */
export interface AudioStore {
  list(
    prefix: string,
    options: { limit: number; offset: number },
  ): Promise<{
    data: { id: string | null; name: string; metadata?: { size?: number } | null }[] | null
    error: { message: string } | null
  }>
  remove(paths: string[]): Promise<{ error: { message: string } | null }>
}

/**
 * HOW MUCH AUDIO ONE ACCOUNT MAY STORE.
 *
 * The bucket caps a single object at 10 MB and restricts its MIME type, both
 * server-side. Neither says anything about how MANY objects one account may
 * have, and signup is free and autoconfirmed — so any account could loop
 * uploads into its own folder and consume unbounded paid storage. Every one of
 * those requests is RLS-legal and owner-scoped, which is exactly why nothing in
 * the database refuses it: the policy is about WHOSE folder, not how big.
 *
 * 200 MB, checked rather than guessed: a two-minute Opus note is roughly half a
 * megabyte and the journal is one entry per day, so this is about 400
 * recordings, or a year of recording something every single day. Comfortable
 * for ordinary use, and it bites long before an abuser costs real money. The
 * message at the limit says what to do about it.
 *
 * Client-enforced, and honest about being so: a true quota belongs in a storage
 * policy or a counted column, which is a migration. This closes the accidental
 * and casual cases now, and FLAG-7 in the audit records what a determined
 * caller can still do by talking to PostgREST directly.
 */
export const JOURNAL_AUDIO_QUOTA_BYTES = 200 * 1024 * 1024

export interface AudioUsage {
  bytes: number
  count: number
}

/** Thrown when a recording would take the account past its quota. */
export class JournalAudioQuotaError extends Error {
  constructor(public readonly usage: AudioUsage) {
    super(quotaMessage(usage))
    this.name = 'JournalAudioQuotaError'
  }
}

const mb = (bytes: number) => Math.max(0, bytes) / (1024 * 1024)

/** What the user is told at the limit. Names the number, and what to do. */
export function quotaMessage(usage: AudioUsage): string {
  const used = mb(usage.bytes)
  return (
    `Your voice notes are using ${used.toFixed(used < 10 ? 1 : 0)} MB of ` +
    `${Math.round(mb(JOURNAL_AUDIO_QUOTA_BYTES))} MB. Delete an older recording to make room, ` +
    `or save this entry as text.`
  )
}

/** Would this recording take the account over? Pure, so it is trivially tested. */
export function exceedsQuota(
  usage: AudioUsage,
  incomingBytes: number,
  quota: number = JOURNAL_AUDIO_QUOTA_BYTES,
): boolean {
  return usage.bytes + Math.max(0, incomingBytes) > quota
}

/**
 * Total bytes and object count in one user's folder.
 *
 * The offset ADVANCES here, unlike the delete sweep: nothing is being removed,
 * so the page below stays where it is. Getting that backwards in either
 * direction is how you silently miss half someone's recordings.
 */
export async function journalAudioUsageIn(
  store: AudioStore,
  userId: string,
  pageSize = AUDIO_PAGE,
): Promise<AudioUsage> {
  let bytes = 0
  let count = 0
  let offset = 0

  for (;;) {
    const { data, error } = await store.list(userId, { limit: pageSize, offset })
    if (error) throw new Error(error.message)
    const objects = (data ?? []).filter((o) => o.id)
    for (const o of objects) {
      count += 1
      bytes += typeof o.metadata?.size === 'number' ? o.metadata.size : 0
    }
    if (objects.length < pageSize) return { bytes, count }
    offset += (data ?? []).length
  }
}

export function journalAudioUsage(userId: string): Promise<AudioUsage> {
  return journalAudioUsageIn(supabase.storage.from(AUDIO_BUCKET), userId)
}

/** How many objects one `list` call returns. Storage caps a page; so do we. */
export const AUDIO_PAGE = 100

export async function removeAllAudioIn(
  store: AudioStore,
  userId: string,
  pageSize = AUDIO_PAGE,
): Promise<number> {
  let removed = 0

  for (;;) {
    const { data, error } = await store.list(userId, { limit: pageSize, offset: 0 })
    if (error) throw new Error(error.message)

    // Folders come back without an `id`; only real objects can be removed.
    const paths = (data ?? []).filter((o) => o.id).map((o) => `${userId}/${o.name}`)
    if (paths.length === 0) return removed

    const { error: removeError } = await store.remove(paths)
    if (removeError) throw new Error(removeError.message)
    removed += paths.length

    // OFFSET STAYS AT 0, and that is the whole trick. The page just deleted no
    // longer exists, so the next page has moved up into its place — advancing
    // the offset would step over exactly as many objects as were removed, and
    // the ones skipped would be the OLDEST recordings, which is the wrong half
    // to leave on a server after promising deletion.
    if (paths.length < pageSize) return removed
  }
}
