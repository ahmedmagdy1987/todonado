import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import { assertRealId, assertRealIds, isOptimisticId, newOptimisticId } from '@/lib/optimistic'
import type {
  NewQuitHabitInput,
  QuitCheckin,
  QuitHabit,
  QuitHabitPatch,
} from '@/types/database'
import { slipPatch } from '../quitMath'

/**
 * Owner-scoped quit mutations with optimistic updates, mirroring
 * useWellnessMutations. The `user_id` on every insert equals the signed-in
 * user (RLS enforces it too).
 *
 * The slip reset is a plain UPDATE of `quit_started_at` + `longest_streak_days`
 * — there is no "reset" endpoint and no counter to zero, because the streak was
 * never stored in the first place. What the update contains is decided by the
 * pure, unit-tested `slipPatch`, so the no-shame rule (the record only ever
 * goes UP) is enforced by a tested function rather than by a component.
 */
/**
 * Mutation key for "a habit is being created".
 *
 * The dialog owns the `createHabit` instance, so the page cannot read its
 * `isPending` — a separate component gets a separate mutation object. Since the
 * insert is awaited (no optimistic row), there is a round trip during which the
 * page still counts zero habits, and the Free cap is enforced ONLY in the client.
 * Without this the user could tap "Add habit" again in that window and get a
 * second habit past a one-habit limit. The page watches this key instead.
 */
export function quitCreateKey(userId: string) {
  return ['quit-habits', 'create', userId] as const
}

export function useQuitMutations(userId: string) {
  const qc = useQueryClient()
  const habitsKey = qk.quitHabits(userId)
  const checkinsKey = qk.quitCheckins(userId)

  type HabitsCache = { rows: QuitHabit[]; available: boolean }

  const setHabits = (u: (p: QuitHabit[]) => QuitHabit[]) =>
    qc.setQueryData<HabitsCache>(habitsKey, (p) => ({
      available: p?.available ?? true,
      rows: u(p?.rows ?? []),
    }))
  const setCheckins = (u: (p: QuitCheckin[]) => QuitCheckin[]) =>
    qc.setQueryData<QuitCheckin[]>(checkinsKey, (p) => u(p ?? []))

  /**
   * Create a habit.
   *
   * DELIBERATELY NOT OPTIMISTIC — this is the one mutation here that must not be.
   * An optimistic row needs a temporary id, and EVERY other action on a habit
   * addresses it by that id: `checkIn` sends it as `habit_id`, and slip / update /
   * delete send it as `id`. Both columns are `uuid`, so a synthetic
   * `optimistic-…` id doesn't even survive the type cast (22P02) — which is not
   * the `23505` the check-in path knows how to forgive, so it threw, rolled back,
   * and the check-in was silently never written. A user who tapped "still clean
   * today" in the few hundred milliseconds before the settle refetch lost it.
   *
   * Awaiting the insert means the card only ever renders with the row's REAL id.
   * Same reasoning, and the same trade (a ~200ms wait for correctness), as
   * `useFocusSessions.startSession`, whose comment says the same thing.
   */
  const createHabit = useMutation({
    mutationFn: async (input: NewQuitHabitInput) => {
      assertRealIds(input)
      const { data, error } = await supabase
        .from('quit_habits')
        .insert({
          user_id: userId,
          name: input.name,
          preset_key: input.preset_key ?? 'custom',
          // Omitted ⇒ the DB default now() decides day zero, so a skewed client
          // clock can't hand someone a head start (or a deficit).
          ...(input.quit_started_at ? { quit_started_at: input.quit_started_at } : {}),
          replacement_action: input.replacement_action ?? null,
          notes: input.notes ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as QuitHabit
    },
    onSuccess: (row) => {
      // Put the real row straight into the cache so the card appears without
      // waiting for the settle refetch — the id is already correct.
      setHabits((p) => [...p.filter((h) => h.id !== row.id), row])
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: habitsKey }),
    // Keyed so the PAGE can tell a create is in flight even though the DIALOG
    // owns this mutation instance — see `quitCreateKey` below.
    mutationKey: quitCreateKey(userId),
    // Non-idempotent insert: don't offer a one-click Retry (could double-insert).
    meta: { noRetry: true },
  })

  const updateHabit = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: QuitHabitPatch }) => {
      assertRealId(id)
      const { data, error } = await supabase
        .from('quit_habits')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as QuitHabit
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: habitsKey })
      const prev = qc.getQueryData<HabitsCache>(habitsKey)
      setHabits((p) => p.map((h) => (h.id === id ? { ...h, ...patch } : h)))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(habitsKey, ctx.prev)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: habitsKey }),
  })

  /**
   * "I slipped" — move day zero to now and bank the run just completed if it
   * beat the record. The whole decision lives in slipPatch(); this is only the
   * transport. Reuses updateHabit's optimistic path so the card's counter
   * resets instantly instead of after a round trip.
   */
  const slip = useMutation({
    mutationFn: async (habit: QuitHabit) => {
      assertRealId(habit.id)
      const patch = slipPatch(habit.quit_started_at, habit.longest_streak_days)
      const { data, error } = await supabase
        .from('quit_habits')
        .update(patch)
        .eq('id', habit.id)
        .select('*')
        .single()
      if (error) throw error
      return data as QuitHabit
    },
    onMutate: async (habit) => {
      await qc.cancelQueries({ queryKey: habitsKey })
      const prev = qc.getQueryData<HabitsCache>(habitsKey)
      const patch = slipPatch(habit.quit_started_at, habit.longest_streak_days)
      setHabits((p) => p.map((h) => (h.id === habit.id ? { ...h, ...patch } : h)))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(habitsKey, ctx.prev)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: habitsKey }),
  })

  const deleteHabit = useMutation({
    mutationFn: async (id: string) => {
      assertRealId(id)
      const { error } = await supabase.from('quit_habits').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: habitsKey })
      await qc.cancelQueries({ queryKey: checkinsKey })
      const prevHabits = qc.getQueryData<HabitsCache>(habitsKey)
      const prevCheckins = qc.getQueryData<QuitCheckin[]>(checkinsKey) ?? []
      setHabits((p) => p.filter((h) => h.id !== id))
      setCheckins((p) => p.filter((c) => c.habit_id !== id)) // DB cascades; mirror in UI
      return { prevHabits, prevCheckins }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevHabits) qc.setQueryData(habitsKey, ctx.prevHabits)
      if (ctx?.prevCheckins) qc.setQueryData(checkinsKey, ctx.prevCheckins)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: habitsKey })
      void qc.invalidateQueries({ queryKey: checkinsKey })
    },
  })

  /**
   * "Still clean today". UNIQUE (habit_id, checked_on) means a double-tap is a
   * duplicate-key error, not a duplicate row — so a same-day repeat is treated
   * as already-done rather than surfaced as a failure.
   */
  const checkIn = useMutation({
    mutationFn: async ({ habitId, day }: { habitId: string; day: string }) => {
      // The write this whole module was built for: `quit_checkins.habit_id` was
      // the first placeholder ever sent to a uuid column. `createHabit` awaits
      // its insert now, so a placeholder habit id cannot exist — this states
      // the invariant rather than relying on that staying true.
      assertRealIds({ habit_id: habitId })
      const { data, error } = await supabase
        .from('quit_checkins')
        .insert({ user_id: userId, habit_id: habitId, checked_on: day })
        .select('*')
        .single()
      if (error) {
        if (error.code === '23505') return null // already checked in today
        throw error
      }
      return data as QuitCheckin
    },
    onMutate: async ({ habitId, day }) => {
      await qc.cancelQueries({ queryKey: checkinsKey })
      const prev = qc.getQueryData<QuitCheckin[]>(checkinsKey) ?? []
      const tempId = newOptimisticId()
      const optimistic: QuitCheckin = {
        id: tempId,
        user_id: userId,
        habit_id: habitId,
        checked_on: day,
        created_at: new Date().toISOString(),
      }
      setCheckins((p) => [optimistic, ...p])
      return { prev, tempId }
    },
    onSuccess: (real, _v, ctx) => {
      // Swap in the real row so its id is available to undo immediately, before
      // the settle refetch — closes a check-in → undo race.
      if (real) setCheckins((p) => p.map((c) => (c.id === ctx?.tempId ? real : c)))
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(checkinsKey, ctx.prev)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: checkinsKey }),
    meta: { noRetry: true },
  })

  const undoCheckIn = useMutation({
    mutationFn: async ({ ids }: { habitId: string; ids: string[] }) => {
      const realIds = ids.filter((id) => !isOptimisticId(id))
      if (realIds.length === 0) return
      const { error } = await supabase.from('quit_checkins').delete().in('id', realIds)
      if (error) throw error
    },
    onMutate: async ({ ids }) => {
      await qc.cancelQueries({ queryKey: checkinsKey })
      const prev = qc.getQueryData<QuitCheckin[]>(checkinsKey) ?? []
      const remove = new Set(ids)
      setCheckins((p) => p.filter((c) => !remove.has(c.id)))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(checkinsKey, ctx.prev)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: checkinsKey }),
  })

  return { createHabit, updateHabit, slip, deleteHabit, checkIn, undoCheckIn }
}
