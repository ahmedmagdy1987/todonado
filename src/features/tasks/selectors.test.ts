import { describe, it, expect } from 'vitest'
import {
  byPosition,
  selectInbox,
  selectToday,
  selectOverdue,
  selectByProject,
  selectBySection,
} from './selectors'
import { makeTask } from '@/test/factories'

const TODAY = '2026-06-02'

describe('selectInbox', () => {
  it('returns open, project-less tasks sorted by position', () => {
    const a = makeTask({ project_id: null, position: 2, title: 'a' })
    const b = makeTask({ project_id: null, position: 1, title: 'b' })
    const withProject = makeTask({ project_id: 'p1' })
    const done = makeTask({ project_id: null, status: 'done' })
    expect(selectInbox([a, b, withProject, done]).map((t) => t.title)).toEqual(['b', 'a'])
  })
})

describe('selectToday', () => {
  it('includes done, excludes cancelled and other days', () => {
    const t1 = makeTask({ scheduled_for: TODAY })
    const doneToday = makeTask({ scheduled_for: TODAY, status: 'done' })
    const cancelled = makeTask({ scheduled_for: TODAY, status: 'cancelled' })
    const other = makeTask({ scheduled_for: '2026-06-01' })
    expect(selectToday([t1, doneToday, cancelled, other], TODAY)).toHaveLength(2)
  })
})

describe('selectOverdue', () => {
  it('returns only open tasks scheduled before today', () => {
    const overdue = makeTask({ scheduled_for: '2026-06-01', title: 'od' })
    const overdueDone = makeTask({ scheduled_for: '2026-06-01', status: 'done' })
    const today = makeTask({ scheduled_for: TODAY })
    expect(selectOverdue([overdue, overdueDone, today], TODAY).map((t) => t.title)).toEqual([
      'od',
    ])
  })
})

describe('selectByProject / selectBySection', () => {
  it('filters by project and section (incl. unsectioned)', () => {
    const inSection = makeTask({ project_id: 'p1', section_id: 's1' })
    const noSection = makeTask({ project_id: 'p1', section_id: null })
    const otherProject = makeTask({ project_id: 'p2' })
    expect(selectByProject([inSection, noSection, otherProject], 'p1')).toHaveLength(2)
    expect(selectBySection([inSection, noSection, otherProject], 'p1', 's1')).toHaveLength(1)
    expect(selectBySection([inSection, noSection, otherProject], 'p1', null)).toHaveLength(1)
  })
})

describe('byPosition', () => {
  it('orders by position, then created_at', () => {
    const a = makeTask({ position: 1, created_at: '2026-01-02T00:00:00Z' })
    const b = makeTask({ position: 1, created_at: '2026-01-01T00:00:00Z' })
    expect([a, b].sort(byPosition)[0]).toBe(b)
  })
})
