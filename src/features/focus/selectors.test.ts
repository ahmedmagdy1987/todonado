import { describe, it, expect } from 'vitest'
import { format, parseISO } from 'date-fns'
import {
  activeSession,
  focusSecondsForTask,
  focusSecondsByTask,
  sessionsOn,
} from './selectors'
import { makeFocusSession } from '@/test/factories'

describe('activeSession', () => {
  it('finds the running session, else null', () => {
    const done = makeFocusSession({ status: 'completed' })
    const live = makeFocusSession({ status: 'running' })
    expect(activeSession([done, live])?.id).toBe(live.id)
    expect(activeSession([done])).toBeNull()
  })
})

describe('focusSecondsForTask / focusSecondsByTask', () => {
  it('sums only completed sessions, per task, excluding general focus', () => {
    const sessions = [
      makeFocusSession({ task_id: 't1', status: 'completed', actual_seconds: 1500 }),
      makeFocusSession({ task_id: 't1', status: 'completed', actual_seconds: 600 }),
      makeFocusSession({ task_id: 't1', status: 'running', actual_seconds: 0 }),
      makeFocusSession({ task_id: 't2', status: 'completed', actual_seconds: 300 }),
      makeFocusSession({ task_id: null, status: 'completed', actual_seconds: 999 }),
    ]
    expect(focusSecondsForTask(sessions, 't1')).toBe(2100)
    const map = focusSecondsByTask(sessions)
    expect(map.get('t1')).toBe(2100)
    expect(map.get('t2')).toBe(300)
    expect(map.size).toBe(2)
  })
})

describe('sessionsOn', () => {
  it('filters sessions started on a given local day', () => {
    const today = makeFocusSession({ started_at: '2026-06-02T12:00:00.000Z' })
    const other = makeFocusSession({ started_at: '2026-05-30T12:00:00.000Z' })
    const day = format(parseISO(today.started_at), 'yyyy-MM-dd')
    expect(sessionsOn([today, other], day).map((s) => s.id)).toEqual([today.id])
  })
})
