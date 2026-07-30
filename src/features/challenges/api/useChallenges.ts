import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type { UserChallenge } from '@/types/database'

/** PostgREST / Postgres codes for "that table isn't there". */
const TABLE_MISSING = new Set(['PGRST205', '42P01'])
/** Unique violation — the same challenge was already joined today. */
const ALREADY_JOINED = '23505'

/**
 * Owner-only challenge attempts (RLS: user_id = auth.uid()).
 *
 * There is deliberately very little here, because the row is deliberately very
 * small: which challenge, when it started, whether it finished. Progress is
 * never fetched because progress is never stored — it is recomputed from the
 * task, focus, quit and journal caches the page already has.
 *
 * DEGRADES GRACEFULLY WHEN THE TABLE IS ABSENT, the same posture as
 * `useVisionCards` / `useMindMaps`.
 */
export function useUserChallenges(userId: string) {
  return useQuery({
    queryKey: qk.userChallenges(userId),
    enabled: !!userId,
    retry: false,
    queryFn: async (): Promise<{ rows: UserChallenge[]; available: boolean }> => {
      const { data, error } = await supabase
        .from('user_challenges')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
      if (error) {
        return { rows: [], available: !TABLE_MISSING.has(error.code) }
      }
      return { rows: (data ?? []) as UserChallenge[], available: true }
    },
  })
}

export function useChallengeMutations(userId: string) {
  const qc = useQueryClient()
  const key = qk.userChallenges(userId)
  type Cache = { rows: UserChallenge[]; available: boolean }

  const settle = () => void qc.invalidateQueries({ queryKey: key })
  const setRows = (u: (p: UserChallenge[]) => UserChallenge[]) =>
    qc.setQueryData<Cache>(key, (p) => ({ available: p?.available ?? true, rows: u(p?.rows ?? []) }))

  /**
   * Join. Awaited rather than optimistic, for the reason `createCard` documents:
   * leave and complete both address the row BY id against a uuid column, and a
   * synthetic `optimistic-…` id would fail against it.
   *
   * A UNIQUE violation is SUCCESS, not an error. `UNIQUE (user_id,
   * challenge_key, started_at)` exists precisely so a double-tap is the same
   * attempt; surfacing 23505 would show a scary failure for a button that did
   * exactly what the user wanted.
   */
  const join = useMutation({
    mutationFn: async ({ challengeKey, startDay }: { challengeKey: string; startDay: string }) => {
      const { data, error } = await supabase
        .from('user_challenges')
        .insert({
          user_id: userId,
          challenge_key: challengeKey,
          started_at: startDay,
          status: 'active',
        })
        .select('*')
        .single()
      if (error) {
        if (error.code === ALREADY_JOINED) return null
        throw error
      }
      return data as UserChallenge
    },
    onSuccess: (row) => {
      if (row) setRows((p) => [row, ...p.filter((r) => r.id !== row.id)])
    },
    onSettled: settle,
    meta: { noRetry: true },
  })

  /**
   * Mark it finished. The row is the only place the OUTCOME lives — progress
   * itself stays derived — so this is written once, when the derived number
   * first reaches the target, and never recomputed.
   */
  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_challenges')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id)
        // Only ever promotes an attempt that is still running: without this a
        // retry, or two tabs, could rewrite a completed_at that already stands.
        .eq('status', 'active')
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Cache>(key)
      setRows((p) =>
        p.map((r) =>
          r.id === id && r.status === 'active'
            ? { ...r, status: 'completed', completed_at: new Date().toISOString() }
            : r,
        ),
      )
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: settle,
  })

  /**
   * Leave. A DELETE, not a status flip — someone stopping a challenge wants it
   * gone, not filed under "abandoned" where it can be read back later. Nothing
   * derived is lost either way: the tasks and sessions it was counting are
   * untouched.
   */
  const leave = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_challenges').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Cache>(key)
      setRows((p) => p.filter((r) => r.id !== id))
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: settle,
  })

  return { join, complete, leave }
}
