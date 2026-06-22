import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { NewTaskInput, Task } from '@/types/database'
import { buildNextOccurrence } from '../recurrence'

export interface CompleteTaskResult {
  task: Task
  /** True only when this call actually spawned the next recurrence. */
  spawnedNext: boolean
}

/** The minimal slice of the Supabase client this needs (keeps it unit-testable). */
type DbClient = Pick<SupabaseClient, 'from' | 'rpc'>

/**
 * True only for PGRST202 — PostgREST's "function not in the schema cache" code,
 * i.e. the RPC isn't deployed yet. Keyed strictly on the code so a real in-RPC
 * failure (e.g. an RLS-rejected spawn) can never be misread as "missing" and
 * silently downgraded to the non-atomic legacy path.
 */
function isMissingFunctionError(error: PostgrestError | null): boolean {
  return error?.code === 'PGRST202'
}

/**
 * Complete or un-complete a task.
 *
 * Completion + next-occurrence spawn is ATOMIC: it goes through the
 * `complete_task` Postgres RPC, which does the compare-and-swap done-UPDATE and
 * the next-occurrence INSERT in a single transaction (both or neither), under
 * the caller's RLS. So a failed spawn can no longer leave a completed task with
 * a broken recurrence chain, and concurrent completes still spawn EXACTLY once
 * (only the CAS winner inserts). The client computes the next occurrence (tested
 * JS date math) and passes it in.
 *
 * Transitional fallback: if the RPC isn't deployed yet (migration not applied),
 * fall back to the legacy two-step so task completion keeps working until the
 * SQL is run. Remove `legacyComplete` once the migration is live everywhere.
 */
export async function completeTask(
  client: DbClient,
  { task, done }: { task: Task; done: boolean },
): Promise<CompleteTaskResult> {
  if (!done) {
    const { data, error } = await client
      .from('tasks')
      .update({ status: 'todo', completed_at: null })
      .eq('id', task.id)
      .select('*')
      .single()
    if (error) throw error
    return { task: data as Task, spawnedNext: false }
  }

  const next = task.recurrence_freq ? buildNextOccurrence(task) : null

  const { data, error } = await client.rpc('complete_task', { p_task_id: task.id, p_next: next })
  if (!error) {
    const result = data as { task: Task; spawned: boolean }
    return { task: result.task, spawnedNext: result.spawned }
  }
  if (!isMissingFunctionError(error)) throw error

  return legacyComplete(client, task, next)
}

/**
 * Legacy non-atomic complete+spawn — used ONLY when the atomic RPC isn't deployed
 * yet. Same compare-and-swap so concurrent completes spawn at most once.
 */
async function legacyComplete(
  client: DbClient,
  task: Task,
  next: NewTaskInput | null,
): Promise<CompleteTaskResult> {
  const { data, error } = await client
    .from('tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', task.id)
    .neq('status', 'done')
    .select('*')
    .maybeSingle()
  if (error) throw error

  if (!data) {
    const { data: current, error: readError } = await client
      .from('tasks')
      .select('*')
      .eq('id', task.id)
      .single()
    if (readError) throw readError
    return { task: current as Task, spawnedNext: false }
  }

  const completed = data as Task
  if (next) {
    const { error: spawnError } = await client.from('tasks').insert(next)
    if (spawnError) throw spawnError
    return { task: completed, spawnedNext: true }
  }
  return { task: completed, spawnedNext: false }
}
