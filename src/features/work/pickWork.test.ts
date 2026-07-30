import { describe, expect, it } from 'vitest'
import { makeTask } from '@/test/factories'
import { pickWork, reasonLabel } from './pickWork'

const TODAY = '2026-07-30'
const YESTERDAY = '2026-07-29'
const TOMORROW = '2026-07-31'

describe('pickWork — nothing to do', () => {
  it('returns nothing for an empty list', () => {
    expect(pickWork([], TODAY)).toEqual({ top: null, reason: null, candidates: [] })
  })

  it('ignores done and cancelled work entirely', () => {
    const tasks = [
      makeTask({ id: 'a', status: 'done', scheduled_for: TODAY }),
      makeTask({ id: 'b', status: 'cancelled', scheduled_for: TODAY }),
    ]
    expect(pickWork(tasks, TODAY)).toEqual({ top: null, reason: null, candidates: [] })
  })
})

describe('pickWork — bucket order', () => {
  it('resumes what you already started, over everything else', () => {
    const tasks = [
      makeTask({ id: 'overdue', scheduled_for: YESTERDAY, priority: 3 }),
      makeTask({ id: 'today', scheduled_for: TODAY, priority: 3 }),
      makeTask({ id: 'started', status: 'in_progress', priority: 0 }),
    ]
    const pick = pickWork(tasks, TODAY)
    expect(pick.top?.id).toBe('started')
    expect(pick.reason).toBe('in_progress')
  })

  it('prefers overdue work to work planned for today', () => {
    const tasks = [
      makeTask({ id: 'today', scheduled_for: TODAY, priority: 3 }),
      makeTask({ id: 'overdue', scheduled_for: YESTERDAY, priority: 0 }),
    ]
    const pick = pickWork(tasks, TODAY)
    expect(pick.top?.id).toBe('overdue')
    expect(pick.reason).toBe('overdue')
  })

  it("prefers today's plan to the backlog", () => {
    const tasks = [
      makeTask({ id: 'backlog', scheduled_for: null, priority: 3 }),
      makeTask({ id: 'today', scheduled_for: TODAY, priority: 0 }),
    ]
    expect(pickWork(tasks, TODAY).top?.id).toBe('today')
    expect(pickWork(tasks, TODAY).reason).toBe('today')
  })

  it('falls back to the backlog rather than showing an empty screen', () => {
    const tasks = [makeTask({ id: 'backlog', scheduled_for: null })]
    const pick = pickWork(tasks, TODAY)
    expect(pick.top?.id).toBe('backlog')
    expect(pick.reason).toBe('backlog')
  })

  it('treats a FUTURE scheduled task as backlog, never as overdue', () => {
    const tasks = [makeTask({ id: 'later', scheduled_for: TOMORROW })]
    expect(pickWork(tasks, TODAY).reason).toBe('backlog')
  })

  it('is boundary-exact: today is "today", yesterday is overdue', () => {
    expect(pickWork([makeTask({ id: 'a', scheduled_for: TODAY })], TODAY).reason).toBe('today')
    expect(pickWork([makeTask({ id: 'a', scheduled_for: YESTERDAY })], TODAY).reason).toBe('overdue')
  })
})

describe('pickWork — tie-breaks inside a bucket', () => {
  it('takes the highest priority first', () => {
    const tasks = [
      makeTask({ id: 'low', scheduled_for: TODAY, priority: 1 }),
      makeTask({ id: 'high', scheduled_for: TODAY, priority: 3 }),
      makeTask({ id: 'mid', scheduled_for: TODAY, priority: 2 }),
    ]
    expect(pickWork(tasks, TODAY).candidates.map((t) => t.id)).toEqual(['high', 'mid', 'low'])
  })

  it('then the soonest due date, with undated last', () => {
    const tasks = [
      makeTask({ id: 'undated', scheduled_for: TODAY, priority: 2, due_date: null }),
      makeTask({ id: 'later', scheduled_for: TODAY, priority: 2, due_date: '2026-08-10' }),
      makeTask({ id: 'sooner', scheduled_for: TODAY, priority: 2, due_date: '2026-08-01' }),
    ]
    expect(pickWork(tasks, TODAY).candidates.map((t) => t.id)).toEqual([
      'sooner',
      'later',
      'undated',
    ])
  })

  it('then the lightest effort, with unestimated last', () => {
    const tasks = [
      makeTask({ id: 'unestimated', scheduled_for: TODAY, priority: 2, effort_minutes: null }),
      makeTask({ id: 'big', scheduled_for: TODAY, priority: 2, effort_minutes: 120 }),
      makeTask({ id: 'small', scheduled_for: TODAY, priority: 2, effort_minutes: 15 }),
    ]
    expect(pickWork(tasks, TODAY).candidates.map((t) => t.id)).toEqual([
      'small',
      'big',
      'unestimated',
    ])
  })

  it("then the user's own drag order", () => {
    const tasks = [
      makeTask({ id: 'second', scheduled_for: TODAY, priority: 2, effort_minutes: 30, position: 2 }),
      makeTask({ id: 'first', scheduled_for: TODAY, priority: 2, effort_minutes: 30, position: 1 }),
    ]
    expect(pickWork(tasks, TODAY).candidates.map((t) => t.id)).toEqual(['first', 'second'])
  })

  it('is a TOTAL order — identical tasks still sort deterministically by id', () => {
    const same = { scheduled_for: TODAY, priority: 2 as const, effort_minutes: 30, position: 1 }
    const forward = pickWork(
      [makeTask({ id: 'b', ...same }), makeTask({ id: 'a', ...same })],
      TODAY,
    )
    const backward = pickWork(
      [makeTask({ id: 'a', ...same }), makeTask({ id: 'b', ...same })],
      TODAY,
    )
    expect(forward.candidates.map((t) => t.id)).toEqual(['a', 'b'])
    expect(backward.candidates.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('pickWork — contract', () => {
  it('never mutates the array it was given', () => {
    const tasks = [
      makeTask({ id: 'b', scheduled_for: TODAY }),
      makeTask({ id: 'a', scheduled_for: YESTERDAY }),
    ]
    const order = tasks.map((t) => t.id)
    pickWork(tasks, TODAY)
    expect(tasks.map((t) => t.id)).toEqual(order)
  })

  it('always puts `top` at the head of `candidates`', () => {
    const tasks = [
      makeTask({ id: 'a', scheduled_for: null }),
      makeTask({ id: 'b', scheduled_for: YESTERDAY }),
      makeTask({ id: 'c', status: 'in_progress' }),
      makeTask({ id: 'd', scheduled_for: TODAY }),
    ]
    const pick = pickWork(tasks, TODAY)
    expect(pick.candidates[0]).toBe(pick.top)
    expect(pick.candidates).toHaveLength(4)
  })
})

describe('reasonLabel', () => {
  it('explains every reason without scolding', () => {
    const labels = (['in_progress', 'overdue', 'today', 'backlog'] as const).map(reasonLabel)
    for (const l of labels) {
      expect(l.length).toBeGreaterThan(0)
      expect(l).not.toMatch(/!|should have|late again|failed/i)
    }
    expect(reasonLabel('overdue')).toBe('This one is overdue')
  })
})
