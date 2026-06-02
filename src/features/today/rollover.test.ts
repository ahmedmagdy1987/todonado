import { describe, it, expect } from 'vitest'
import { selectRolloverTasks } from './rollover'
import { makeTask } from '@/test/factories'

describe('selectRolloverTasks', () => {
  it('selects only open, overdue tasks', () => {
    const od = makeTask({ scheduled_for: '2026-06-01', title: 'od' })
    const odDone = makeTask({ scheduled_for: '2026-05-30', status: 'done' })
    const today = makeTask({ scheduled_for: '2026-06-02' })
    const unscheduled = makeTask({ scheduled_for: null })
    const result = selectRolloverTasks([od, odDone, today, unscheduled], '2026-06-02')
    expect(result.map((t) => t.title)).toEqual(['od'])
  })
})
