import { describe, it, expect } from 'vitest'
import { makeTask } from '@/test/factories'
import { applyTaskView, filterByPriority, sortTasks } from './sort'

describe('sortTasks', () => {
  it('manual: respects persisted position (then created_at)', () => {
    const a = makeTask({ position: 2, title: 'a' })
    const b = makeTask({ position: 1, title: 'b' })
    const c = makeTask({ position: 3, title: 'c' })
    expect(sortTasks([a, b, c], 'manual').map((t) => t.title)).toEqual(['b', 'a', 'c'])
  })

  it('priority: High -> None, manual order within the same level', () => {
    const low = makeTask({ priority: 1, position: 1, title: 'low' })
    const high = makeTask({ priority: 3, position: 2, title: 'high' })
    const med = makeTask({ priority: 2, position: 3, title: 'med' })
    const high2 = makeTask({ priority: 3, position: 4, title: 'high2' })
    expect(sortTasks([low, high, med, high2], 'priority').map((t) => t.title)).toEqual([
      'high', // priority 3, position 2
      'high2', // priority 3, position 4
      'med',
      'low',
    ])
  })

  it('due: soonest first, no-due-date last, manual tiebreak', () => {
    const noDue = makeTask({ due_date: null, position: 1, title: 'no-due' })
    const later = makeTask({ due_date: '2026-07-01', position: 2, title: 'later' })
    const soon = makeTask({ due_date: '2026-06-10', position: 3, title: 'soon' })
    expect(sortTasks([noDue, later, soon], 'due').map((t) => t.title)).toEqual([
      'soon',
      'later',
      'no-due',
    ])
  })

  it('effort: lightest first, unestimated last, manual tiebreak', () => {
    const big = makeTask({ effort_minutes: 120, position: 1, title: 'big' })
    const none = makeTask({ effort_minutes: null, position: 2, title: 'none' })
    const small = makeTask({ effort_minutes: 15, position: 3, title: 'small' })
    expect(sortTasks([big, none, small], 'effort').map((t) => t.title)).toEqual([
      'small',
      'big',
      'none',
    ])
  })

  it('does not mutate the input array', () => {
    const list = [makeTask({ position: 2 }), makeTask({ position: 1 })]
    const copy = [...list]
    sortTasks(list, 'manual')
    expect(list).toEqual(copy)
  })
})

describe('filterByPriority', () => {
  const tasks = [
    makeTask({ priority: 0, title: 'none' }),
    makeTask({ priority: 1, title: 'low' }),
    makeTask({ priority: 3, title: 'high' }),
    makeTask({ priority: 3, title: 'high2' }),
  ]

  it("'all' returns everything", () => {
    expect(filterByPriority(tasks, 'all')).toHaveLength(4)
  })

  it('filters to an exact priority level', () => {
    expect(filterByPriority(tasks, 3).map((t) => t.title)).toEqual(['high', 'high2'])
    expect(filterByPriority(tasks, 0).map((t) => t.title)).toEqual(['none'])
    expect(filterByPriority(tasks, 2)).toHaveLength(0)
  })
})

describe('applyTaskView', () => {
  it('filters then sorts', () => {
    const tasks = [
      makeTask({ priority: 3, due_date: '2026-07-01', position: 1, title: 'high-later' }),
      makeTask({ priority: 1, due_date: '2026-06-01', position: 2, title: 'low-soon' }),
      makeTask({ priority: 3, due_date: '2026-06-05', position: 3, title: 'high-soon' }),
    ]
    // High only, sorted by due date: high-soon (Jun 5) before high-later (Jul 1).
    expect(
      applyTaskView(tasks, { priorityFilter: 3, sortMode: 'due' }).map((t) => t.title),
    ).toEqual(['high-soon', 'high-later'])
  })
})
