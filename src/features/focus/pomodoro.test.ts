import { describe, expect, it } from 'vitest'
import { makeFocusSession } from '@/test/factories'
import {
  POMODORO,
  type PomodoroCadence,
  beginNextWorkInterval,
  breakAfter,
  breakLabel,
  breakProgress,
  breakRemainingSeconds,
  completeWorkInterval,
  cyclePosition,
  endBreak,
  isBreakOver,
  pomodorosCompletedOn,
  startChain,
} from './pomodoro'

const S = 1000

describe('POMODORO cadence', () => {
  it('is the classic 25/5 with a 15-minute long break every 4', () => {
    expect(POMODORO).toEqual({
      workMinutes: 25,
      breakMinutes: 5,
      longBreakMinutes: 15,
      cyclesBeforeLongBreak: 4,
    })
  })
})

describe('breakAfter', () => {
  it('gives the short break after intervals 1, 2 and 3', () => {
    for (const n of [1, 2, 3]) {
      expect(breakAfter(n), `after ${n}`).toEqual({ kind: 'break', minutes: 5 })
    }
  })

  it('gives the LONG break on every 4th interval, exactly', () => {
    for (const n of [4, 8, 12, 16, 400]) {
      expect(breakAfter(n), `after ${n}`).toEqual({ kind: 'long-break', minutes: 15 })
    }
  })

  it('never gives a long break one either side of the boundary', () => {
    for (const n of [3, 5, 7, 9, 11, 13]) {
      expect(breakAfter(n).kind, `after ${n}`).toBe('break')
    }
  })

  it('does not treat "nothing completed yet" as a long break', () => {
    // 0 % 4 === 0 would light up the long break — this is the off-by-one guard.
    expect(breakAfter(0).kind).toBe('break')
    expect(breakAfter(-1).kind).toBe('break')
  })

  it('honours a custom cadence', () => {
    const c: PomodoroCadence = {
      workMinutes: 50,
      breakMinutes: 10,
      longBreakMinutes: 30,
      cyclesBeforeLongBreak: 2,
    }
    expect(breakAfter(1, c)).toEqual({ kind: 'break', minutes: 10 })
    expect(breakAfter(2, c)).toEqual({ kind: 'long-break', minutes: 30 })
    expect(breakAfter(3, c)).toEqual({ kind: 'break', minutes: 10 })
    expect(breakAfter(4, c)).toEqual({ kind: 'long-break', minutes: 30 })
  })

  it('cannot divide by zero on a degenerate cadence', () => {
    const c: PomodoroCadence = { ...POMODORO, cyclesBeforeLongBreak: 0 }
    expect(breakAfter(4, c).kind).toBe('break')
  })
})

describe('cyclePosition', () => {
  it('counts the NEXT interval 1..4 and wraps', () => {
    expect(cyclePosition(0)).toBe(1)
    expect(cyclePosition(1)).toBe(2)
    expect(cyclePosition(2)).toBe(3)
    expect(cyclePosition(3)).toBe(4)
    expect(cyclePosition(4)).toBe(1) // long break taken; a new set begins
    expect(cyclePosition(7)).toBe(4)
    expect(cyclePosition(8)).toBe(1)
  })

  it('is always inside 1..cyclesBeforeLongBreak', () => {
    for (let n = 0; n <= 200; n++) {
      const p = cyclePosition(n)
      expect(p, `completed ${n}`).toBeGreaterThanOrEqual(1)
      expect(p, `completed ${n}`).toBeLessThanOrEqual(POMODORO.cyclesBeforeLongBreak)
    }
  })

  it('never returns 0 for a negative count', () => {
    expect(cyclePosition(-3)).toBe(1)
  })
})

describe('the break clock', () => {
  const brk = { kind: 'break' as const, minutes: 5, startedAtMs: 1_000_000 }

  it('is drift-resistant — a pure function of now, not of tick count', () => {
    expect(breakRemainingSeconds(brk, 1_000_000)).toBe(300)
    expect(breakRemainingSeconds(brk, 1_000_000 + 60 * S)).toBe(240)
    // Nothing ticked for four minutes (throttled tab); the answer is still right.
    expect(breakRemainingSeconds(brk, 1_000_000 + 299 * S)).toBe(1)
  })

  it('clamps at zero rather than counting negative', () => {
    expect(breakRemainingSeconds(brk, 1_000_000 + 300 * S)).toBe(0)
    expect(breakRemainingSeconds(brk, 1_000_000 + 9_999 * S)).toBe(0)
  })

  it('ignores a clock that appears to run backwards', () => {
    expect(breakRemainingSeconds(brk, 1_000_000 - 60 * S)).toBe(300)
  })

  it('reports progress inside 0..1', () => {
    expect(breakProgress(brk, 1_000_000)).toBe(0)
    expect(breakProgress(brk, 1_000_000 + 150 * S)).toBeCloseTo(0.5, 5)
    expect(breakProgress(brk, 1_000_000 + 300 * S)).toBe(1)
    expect(breakProgress(brk, 1_000_000 + 900 * S)).toBe(1)
    expect(breakProgress(brk, 1_000_000 - 900 * S)).toBe(0)
  })

  it('treats a zero-length break as already finished rather than dividing by zero', () => {
    const zero = { kind: 'break' as const, minutes: 0, startedAtMs: 1_000_000 }
    expect(breakProgress(zero, 1_000_000)).toBe(1)
    expect(isBreakOver(zero, 1_000_000)).toBe(true)
  })

  it('is over exactly on the boundary, not a second early', () => {
    expect(isBreakOver(brk, 1_000_000 + 299 * S)).toBe(false)
    expect(isBreakOver(brk, 1_000_000 + 300 * S)).toBe(true)
  })

  it('measures a long break over its own 15 minutes', () => {
    const long = { kind: 'long-break' as const, minutes: 15, startedAtMs: 0 }
    expect(breakRemainingSeconds(long, 0)).toBe(900)
    expect(isBreakOver(long, 899 * S)).toBe(false)
    expect(isBreakOver(long, 900 * S)).toBe(true)
  })
})

describe('chain lifecycle', () => {
  it('starts clean', () => {
    expect(startChain('s1')).toEqual({ sessionId: 's1', taskId: null, completed: 0, break: null })
  })

  it('banks a finished interval and opens the break it earns', () => {
    const chain = completeWorkInterval(startChain('s1'), 5_000)
    expect(chain).toEqual({
      sessionId: null,
      taskId: null,
      completed: 1,
      break: { kind: 'break', minutes: 5, startedAtMs: 5_000 },
    })
  })

  it('clears sessionId when the interval ends, so a finished row cannot look active', () => {
    expect(completeWorkInterval(startChain('s1'), 1).sessionId).toBeNull()
  })

  it('carries the count across the break into the next interval', () => {
    let chain = completeWorkInterval(startChain('s1'), 1_000)
    chain = beginNextWorkInterval(chain, 's2')
    expect(chain).toEqual({ sessionId: 's2', taskId: null, completed: 1, break: null })
  })

  it('opens the LONG break on the fourth interval of a real chain', () => {
    let chain = startChain('s1')
    const kinds: string[] = []
    for (let i = 1; i <= 8; i++) {
      chain = completeWorkInterval(chain, i * 100_000)
      kinds.push(chain.break!.kind)
      expect(chain.completed).toBe(i)
      chain = beginNextWorkInterval(chain, `s${i + 1}`)
    }
    expect(kinds).toEqual([
      'break',
      'break',
      'break',
      'long-break',
      'break',
      'break',
      'break',
      'long-break',
    ])
  })

  it('walks the cycle position in step with the chain', () => {
    let chain = startChain('s1')
    const positions = [cyclePosition(chain.completed)]
    for (let i = 1; i <= 5; i++) {
      chain = beginNextWorkInterval(completeWorkInterval(chain, i), `s${i + 1}`)
      positions.push(cyclePosition(chain.completed))
    }
    expect(positions).toEqual([1, 2, 3, 4, 1, 2])
  })

  it('endBreak drops the break but keeps the count', () => {
    const chain = completeWorkInterval(startChain('s1'), 1_000)
    expect(endBreak(chain)).toEqual({ sessionId: null, taskId: null, completed: 1, break: null })
  })

  it('carries the task across every break, so a chain keeps working the same thing', () => {
    let chain = startChain('s1', 'task-42')
    for (let i = 1; i <= 5; i++) {
      chain = completeWorkInterval(chain, i * 1_000)
      expect(chain.taskId, `after interval ${i}`).toBe('task-42')
      chain = beginNextWorkInterval(chain, `s${i + 1}`)
      expect(chain.taskId, `into interval ${i + 1}`).toBe('task-42')
    }
    expect(endBreak(chain).taskId).toBe('task-42')
  })

  it('keeps a general-focus chain task-less', () => {
    const chain = beginNextWorkInterval(completeWorkInterval(startChain('s1'), 1), 's2')
    expect(chain.taskId).toBeNull()
  })

  it('never mutates the chain it was given', () => {
    const before = startChain('s1')
    const snapshot = structuredClone(before)
    completeWorkInterval(before, 1)
    beginNextWorkInterval(before, 's2')
    endBreak(before)
    expect(before).toEqual(snapshot)
  })
})

describe('pomodorosCompletedOn', () => {
  const day = '2026-07-30'
  const at = (h: number) => new Date(2026, 6, 30, h, 0).toISOString()

  it('counts only COMPLETED intervals of the cadence length, on that local day', () => {
    const sessions = [
      makeFocusSession({ planned_minutes: 25, status: 'completed', started_at: at(9) }),
      makeFocusSession({ planned_minutes: 25, status: 'completed', started_at: at(10) }),
      // still running — not finished, so not a pomodoro yet
      makeFocusSession({ planned_minutes: 25, status: 'running', started_at: at(11) }),
      // abandoned — a bailed interval is not a pomodoro
      makeFocusSession({ planned_minutes: 25, status: 'abandoned', started_at: at(12) }),
      // a classic 50-minute sprint is a session, but it is not a pomodoro
      makeFocusSession({ planned_minutes: 50, status: 'completed', started_at: at(13) }),
      // yesterday
      makeFocusSession({
        planned_minutes: 25,
        status: 'completed',
        started_at: new Date(2026, 6, 29, 9, 0).toISOString(),
      }),
    ]
    expect(pomodorosCompletedOn(sessions, day)).toBe(2)
  })

  it('is 0 with no sessions at all', () => {
    expect(pomodorosCompletedOn([], day)).toBe(0)
  })

  it('follows a custom cadence length', () => {
    const sessions = [
      makeFocusSession({ planned_minutes: 50, status: 'completed', started_at: at(9) }),
      makeFocusSession({ planned_minutes: 25, status: 'completed', started_at: at(10) }),
    ]
    expect(pomodorosCompletedOn(sessions, day, { ...POMODORO, workMinutes: 50 })).toBe(1)
  })
})

describe('breakLabel', () => {
  it('reads naturally in a sentence', () => {
    expect(breakLabel('break')).toBe('break')
    expect(breakLabel('long-break')).toBe('long break')
  })
})
