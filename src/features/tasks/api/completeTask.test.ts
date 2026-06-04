import { describe, it, expect } from 'vitest'
import { completeTask } from './completeTask'
import { makeTask } from '@/test/factories'
import type { Task } from '@/types/database'

/**
 * Minimal in-memory fake of the Supabase query builder for a single tasks row.
 * It models the one property the atomicity relies on: a conditional UPDATE
 * (.neq('status','done')) only matches — and only returns a row — while the
 * stored status is not yet 'done'. Mutations apply synchronously, so two
 * completes invoked back-to-back serialize exactly as Postgres would.
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
      if (!match) return { data: null, error: null } // CAS miss — row already changed
      Object.assign(t, this.patch)
      return { data: { ...t }, error: null }
    }
    if (match) return { data: { ...t }, error: null }
    return { data: null, error: allowEmpty ? null : { message: 'no rows' } }
  }
}

function makeClient(task: Task) {
  const store: Store = { task: { ...task }, inserts: [] }
  const client = { from: () => new FakeQuery(store) }
  // The fake intentionally implements only the slice completeTask uses.
  return { client: client as unknown as Parameters<typeof completeTask>[0], store }
}

describe('completeTask — atomic spawn-once', () => {
  it('double-complete spawns the next occurrence exactly once', async () => {
    const task = makeTask({
      id: 't1',
      status: 'todo',
      scheduled_for: '2026-06-01',
      recurrence_freq: 'daily',
      recurrence_interval: 1,
    })
    const { client, store } = makeClient(task)

    const results = await Promise.all([
      completeTask(client, { id: 't1', done: true }),
      completeTask(client, { id: 't1', done: true }),
    ])

    expect(store.inserts).toHaveLength(1) // exactly one next occurrence
    expect(results.filter((r) => r.spawnedNext)).toHaveLength(1)
    expect(store.task.status).toBe('done')
  })

  it('completing an already-done recurring task does not spawn', async () => {
    const task = makeTask({
      id: 't2',
      status: 'done',
      scheduled_for: '2026-06-01',
      recurrence_freq: 'daily',
    })
    const { client, store } = makeClient(task)
    const r = await completeTask(client, { id: 't2', done: true })
    expect(store.inserts).toHaveLength(0)
    expect(r.spawnedNext).toBe(false)
  })

  it('completing a non-recurring task spawns nothing but still marks done', async () => {
    const task = makeTask({ id: 't3', status: 'todo', recurrence_freq: null })
    const { client, store } = makeClient(task)
    const r = await completeTask(client, { id: 't3', done: true })
    expect(store.inserts).toHaveLength(0)
    expect(r.spawnedNext).toBe(false)
    expect(store.task.status).toBe('done')
  })

  it('un-completing flips back to todo and never spawns', async () => {
    const task = makeTask({
      id: 't4',
      status: 'done',
      completed_at: '2026-06-01T00:00:00.000Z',
      scheduled_for: '2026-06-01',
      recurrence_freq: 'daily',
    })
    const { client, store } = makeClient(task)
    const r = await completeTask(client, { id: 't4', done: false })
    expect(store.task.status).toBe('todo')
    expect(store.task.completed_at).toBeNull()
    expect(store.inserts).toHaveLength(0)
    expect(r.spawnedNext).toBe(false)
  })
})
