import { describe, it, expect } from 'vitest'
import {
  computeCapacity,
  sumEffort,
  suggestTasksToMoveTomorrow,
  NEAR_THRESHOLD,
} from './capacity'
import { makeTask } from '@/test/factories'

describe('sumEffort', () => {
  it('sums effort, treating null as 0', () => {
    expect(
      sumEffort([{ effort_minutes: 30 }, { effort_minutes: null }, { effort_minutes: 90 }]),
    ).toBe(120)
  })
})

describe('computeCapacity', () => {
  it('is empty when nothing is planned', () => {
    const c = computeCapacity(0, 360)
    expect(c.status).toBe('empty')
    expect(c.freeMinutes).toBe(360)
    expect(c.barPct).toBe(0)
  })

  it('is ok below the near threshold', () => {
    const c = computeCapacity(120, 360)
    expect(c.status).toBe('ok')
    expect(c.overMinutes).toBe(0)
  })

  it('is near at/above the threshold', () => {
    expect(computeCapacity(300, 360).status).toBe('near')
    expect(computeCapacity(Math.round(360 * NEAR_THRESHOLD), 360).status).toBe('near')
  })

  it('is over when planned exceeds capacity', () => {
    const c = computeCapacity(420, 360)
    expect(c.status).toBe('over')
    expect(c.overMinutes).toBe(60)
    expect(c.freeMinutes).toBe(0)
    expect(c.barPct).toBe(100)
    expect(c.pct).toBe(117)
  })

  it('falls back to the default capacity when given a non-positive value', () => {
    expect(computeCapacity(60, 0).capacityMinutes).toBe(360)
  })
})

describe('suggestTasksToMoveTomorrow', () => {
  it('returns nothing when under capacity', () => {
    const tasks = [makeTask({ effort_minutes: 60 }), makeTask({ effort_minutes: 60 })]
    expect(suggestTasksToMoveTomorrow(tasks, 360)).toEqual([])
  })

  it('moves the lowest-priority task(s) first until under capacity', () => {
    const low = makeTask({ effort_minutes: 120, priority: 0, title: 'low' })
    const high = makeTask({ effort_minutes: 120, priority: 3, title: 'high' })
    const mid = makeTask({ effort_minutes: 120, priority: 1, title: 'mid' })
    const result = suggestTasksToMoveTomorrow([high, low, mid], 240) // over by 120
    expect(result.map((t) => t.title)).toEqual(['low'])
  })

  it('ignores done/cancelled and effort-less tasks as candidates', () => {
    const done = makeTask({ effort_minutes: 200, status: 'done', priority: 0 })
    const noEffort = makeTask({ effort_minutes: null, priority: 0 })
    const open = makeTask({ effort_minutes: 200, status: 'todo', priority: 0, title: 'open' })
    const result = suggestTasksToMoveTomorrow([done, noEffort, open], 300)
    expect(result.map((t) => t.title)).toEqual(['open'])
  })
})
