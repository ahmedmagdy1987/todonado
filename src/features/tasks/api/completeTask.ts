import type { SupabaseClient } from '@supabase/supabase-js'
import type { Task } from '@/types/database'
import { buildNextOccurrence } from '../recurrence'

export interface CompleteTaskResult {
  task: Task
  /** True only when this call actually spawned the next recurrence. */
  spawnedNext: boolean
}

/** The minimal slice of the Supabase client this needs (keeps it unit-testable). */
type DbClient = Pick<SupabaseClient, 'from'>

/**
 * Complete or un-complete a task.
 *
 * Completion is an ATOMIC compare-and-swap on status:
 *   update({status:'done'}).eq('id', id).neq('status','done')
 * Postgres serializes concurrent writers to the row, so of any number of
 * simultaneous completes (rapid double-click, the task list AND the Focus
 * summary, or two devices) only ONE updates a row and gets it back. That single
 * winner spawns the next recurrence, so the next occurrence is created
 * EXACTLY ONCE — replacing the old SELECT→UPDATE→INSERT which could duplicate.
 */
export async function completeTask(
  client: DbClient,
  { id, done }: { id: string; done: boolean },
): Promise<CompleteTaskResult> {
  if (!done) {
    const { data, error } = await client
      .from('tasks')
      .update({ status: 'todo', completed_at: null })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return { task: data as Task, spawnedNext: false }
  }

  const { data, error } = await client
    .from('tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', id)
    .neq('status', 'done')
    .select('*')
    .maybeSingle()
  if (error) throw error

  if (!data) {
    // Lost the race / already done: do NOT spawn. Return the current row.
    const { data: current, error: readError } = await client
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single()
    if (readError) throw readError
    return { task: current as Task, spawnedNext: false }
  }

  const task = data as Task
  if (task.recurrence_freq) {
    const next = buildNextOccurrence(task)
    if (next) {
      const { error: spawnError } = await client.from('tasks').insert(next)
      if (spawnError) throw spawnError
      return { task, spawnedNext: true }
    }
  }
  return { task, spawnedNext: false }
}
