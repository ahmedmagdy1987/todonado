import { describe, it, expect } from 'vitest'
import { completeTask } from './completeTask'
import { makeTask } from '@/test/factories'
import type { Task } from '@/types/database'

/**
 * Fakes the two surfaces completeTask uses:
 *  - client.rpc('complete_task', …): models the atomic Postgres function —
 *    compare-and-swap completion + (optional) next-occurrence INSERT, both or
 *    neither. A spawn failure rolls back EVERYTHING (status stays 'todo').
 *  - client.from('tasks'): the un-complete path and the legacy fallback (used
 *    only when the RPC isn't deployed yet).
 */
type Filter = ['eq' | 'neq', string, unknown]

interface Store {
  task: Record<string, unknown>
  inserts: unknown[]
}

class FakeQuery {
  private op: 'select' | 'update' | null = null
  private patch: Record<string, unknown> = {}
  private filters: Filter[] = []
  constructor(private store: Store) {}

  update(patch: Record<string, unknown>) {
    this.op = 'update'
    this.patch = patch
    return this
  }
  insert(row: unknown) {
    this.store.inserts.push(row)
    return Promise.resolve({ data: null, error: null })
  }
  select() {
    if (!this.op) this.op = 'select'
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push(['eq', col, val])
    return this
  }
  neq(col: string, val: unknown) {
    this.filters.push(['neq', col, val])
    return this
  }
  single() {
    return Promise.resolve(this.run(false))
  }
  maybeSingle() {
    return Promise.resolve(this.run(true))
  }
  private run(allowEmpty: boolean) {
    const t = this.store.task
    const match = this.filters.every(([op, col, val]) =>
      op === 'eq' ? t[col] === val : t[col] !== val,
    )
    if (this.op === 'update') {
      if (!match) return { data: null, error: null }
      Object.assign(t, this.patch)
      return { data: { ...t }, error: null }
    }
    if (match) return { data: { ...t }, error: null }
    return { data: null, error: allowEmpty ? null : { message: 'no rows' } }
  }
}

function makeClient(task: Task, opts: { failSpawn?: boolean; rpcMissing?: boolean } = {}) {
  const store: Store = { task: { ...task }, inserts: [] }

  const rpc = (fn: string, args: { p_task_id: string; p_next: unknown }) => {
    if (opts.rpcMissing) {
      return Promise.resolve({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.complete_task' },
      })
    }
    if (fn !== 'complete_task') {
      return Promise.resolve({ data: null, error: { code: 'XX', message: 'unknown rpc' } })
    }
    if (store.task.status === 'done') {
      // CAS miss (already done): no change, no spawn.
      return Promise.resolve({ data: { task: { ...store.task }, spawned: false }, error: null })
    }
    if (args.p_next && opts.failSpawn) {
      // Atomic failure: the whole transaction rolls back — nothing changes.
      return Promise.resolve({ data: null, error: { code: '23503', message: 'spawn failed' } })
    }
    store.task.status = 'done'
    store.task.completed_at = '2026-06-01T00:00:00.000Z'
    if (args.p_next) store.inserts.push(args.p_next)
    return Promise.resolve({
      data: { task: { ...store.task }, spawned: !!args.p_next },
      error: null,
    })
  }

  const client = { rpc, from: () => new FakeQuery(store) }
  return { client: client as unknown as Parameters<typeof completeTask>[0], store }
}

const recurring = (over: Partial<Task> = {}) =>
  makeTask({
    id: 't1',
    status: 'todo',
    scheduled_for: '2026-06-01',
    recurrence_freq: 'daily',
    recurrence_interval: 1,
    ...over,
  })

describe('completeTask — atomic complete + spawn (via RPC)', () => {
  it('completing a recurring task spawns the next occurrence exactly once', async () => {
    const { client, store } = makeClient(recurring())
    const r = await completeTask(client, { task: recurring(), done: true })
    expect(store.task.status).toBe('done')
    expect(store.inserts).toHaveLength(1)
    expect(r.spawnedNext).toBe(true)
  })

  it('double-complete spawns exactly once (compare-and-swap)', async () => {
    const task = recurring()
    const { client, store } = makeClient(task)
    const results = await Promise.all([
      completeTask(client, { task, done: true }),
      completeTask(client, { task, done: true }),
    ])
    expect(store.inserts).toHaveLength(1)
    expect(results.filter((r) => r.spawnedNext)).toHaveLength(1)
    expect(store.task.status).toBe('done')
  })

  it('already-done recurring task does not spawn', async () => {
    const task = recurring({ status: 'done' })
    const { client, store } = makeClient(task)
    const r = await completeTask(client, { task, done: true })
    expect(store.inserts).toHaveLength(0)
    expect(r.spawnedNext).toBe(false)
  })

  it('non-recurring task marks done but spawns nothing', async () => {
    const task = makeTask({ id: 't3', status: 'todo', recurrence_freq: null })
    const { client, store } = makeClient(task)
    const r = await completeTask(client, { task, done: true })
    expect(store.task.status).toBe('done')
    expect(store.inserts).toHaveLength(0)
    expect(r.spawnedNext).toBe(false)
  })

  // H5 acceptance: a failed spawn must NOT leave the task completed (no half-state).
  it('a spawn failure leaves the task NOT marked done (atomic rollback)', async () => {
    const task = recurring()
    const { client, store } = makeClient(task, { failSpawn: true })
    await expect(completeTask(client, { task, done: true })).rejects.toMatchObject({
      message: 'spawn failed',
    })
    expect(store.task.status).toBe('todo') // rolled back — not 'done'
    expect(store.inserts).toHaveLength(0)
  })

  it('un-completing flips back to todo and never spawns', async () => {
    const task = recurring({ status: 'done', completed_at: '2026-06-01T00:00:00.000Z' })
    const { client, store } = makeClient(task)
    const r = await completeTask(client, { task, done: false })
    expect(store.task.status).toBe('todo')
    expect(store.task.completed_at).toBeNull()
    expect(store.inserts).toHaveLength(0)
    expect(r.spawnedNext).toBe(false)
  })

  it('falls back to the legacy two-step when the RPC is not deployed yet', async () => {
    const task = recurring()
    const { client, store } = makeClient(task, { rpcMissing: true })
    const r = await completeTask(client, { task, done: true })
    expect(store.task.status).toBe('done')
    expect(store.inserts).toHaveLength(1)
    expect(r.spawnedNext).toBe(true)
  })
})
