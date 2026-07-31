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
