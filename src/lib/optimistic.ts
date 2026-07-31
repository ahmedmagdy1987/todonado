/**
 * Placeholder ids for optimistic inserts — and the one rule that goes with them.
 *
 * ── WHY THIS MODULE EXISTS ───────────────────────────────────────────────────
 * An optimistic create renders a row before the database has one, which means
 * it renders a row with an id the database has never seen. Every id column in
 * this schema is `uuid`, so sending `optimistic-…` to PostgREST is a 22P02
 * PARSE error, not a clean rejection — and the global mutation-error handler
 * then offers a Retry that replays the same invalid id.
 *
 * That is not hypothetical: it shipped once as `checkIn` sending a placeholder
 * habit id into `quit_checkins.habit_id`, and a full audit found the same shape
 * live in five more hooks — tasks, projects, sections, subtasks and wellness
 * items — while four other hooks carried comments explaining why they had
 * avoided it. Four documenting the hazard and five reproducing it is not a
 * pattern, it is a coin flip.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * A hook that mints one of these ids owes TWO things:
 *
 *   1. RECONCILE. In `onSuccess`, swap the placeholder for the real row rather
 *      than waiting for the settle refetch — otherwise the row is live and
 *      clickable, with an unusable id, for a whole round trip.
 *   2. REFUSE. Every OTHER mutation that addresses a row by id must call
 *      `isOptimisticId` first and fail loudly rather than sending it.
 *
 * The alternative — awaiting the insert and never minting an id at all — is
 * what `useVision`, `useMindMaps`, `useChallenges` and `createHabit` do, and it
 * is the better choice when the caller needs the real id immediately (to
 * navigate to it, or to reference it from another table). Prefer that for any
 * NEW table; this module is for the surfaces where an instant row is the point.
 */

const PREFIX = 'optimistic-'

/** A placeholder id for a row that does not exist in the database yet. */
export function newOptimisticId(): string {
  return `${PREFIX}${crypto.randomUUID()}`
}

/** Is this a placeholder that must never be sent to the database? */
export function isOptimisticId(id: string): boolean {
  return id.startsWith(PREFIX)
}

/**
 * Shown when a write reaches a row that has not been inserted yet.
 *
 * Deliberately an error rather than a silent no-op: the user tapped something
 * and it did not happen, and saying so is better than pretending it did. With
 * reconciliation in place this is a backstop — reachable mainly when mutations
 * are queued offline — rather than a path anyone should meet.
 */
export const STILL_SAVING_ERROR = 'That’s still being saved. Try again in a moment.'

/** Throws if `id` is a placeholder. Call at the top of every id-addressing write. */
export function assertRealId(id: string): void {
  if (isOptimisticId(id)) throw new Error(STILL_SAVING_ERROR)
}

/**
 * Every key that names a row: the row's own `id`, or a FOREIGN KEY to another
 * table (`task_id`, `section_id`, `project_id`, …). Every one of them is a
 * `uuid` column in this schema.
 */
const ID_KEY = /^(id|[a-z0-9_]+_id)$/

/**
 * Throws if ANY id-shaped key in an insert/update payload is a placeholder.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM `assertRealId` ───────────────────────────
 * `assertRealId` guards the row a write ADDRESSES. It says nothing about the
 * rows a write REFERENCES. Every hook in this repo guarded the first and none
 * guarded the second, so the audit that closed the `quit_checkins.habit_id`
 * leak left two identical leaks open: a task inserted with a placeholder
 * `section_id`, and a subtask inserted with a placeholder `task_id`. Both are
 * uuid FKs on a DIFFERENT table from the one that minted the id, which is
 * exactly the blind spot — the minting hook is innocent, the guard belongs on
 * the *referencing* write.
 *
 * Call it at the top of every mutationFn that sends a payload. It is a no-op
 * for payloads with no id-shaped keys, so applying it uniformly costs nothing
 * and removes the judgement call about which writes "need" it.
 */
export function assertRealIds(input: unknown): void {
  if (input === null || typeof input !== 'object') return
  for (const row of Array.isArray(input) ? input : [input]) {
    if (row === null || typeof row !== 'object') continue
    for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
      if (!ID_KEY.test(key)) continue
      if (typeof value === 'string' && isOptimisticId(value)) {
        throw new Error(STILL_SAVING_ERROR)
      }
    }
  }
}
