import { describe, expect, it } from 'vitest'
import { makeFocusSession, makeTask } from '@/test/factories'
import { POINTS_WINDOW_DAYS, POINT_WEIGHTS } from '@/lib/config'
import { POINT_LEVELS, computePoints, levelFor, pointsToNextLevel } from './points'

const TODAY = '2026-07-30'

/** Local timestamp on a given day — points bucket by LOCAL calendar day. */
const at = (day: string, hour = 12): string => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, hour).toISOString()
}

const daysAgo = (n: number): string => {
  const d = new Date(2026, 6, 30)
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const done = (over: Partial<Parameters<typeof makeTask>[0]> = {}) =>
  makeTask({ status: 'done', completed_at: at(TODAY), effort_minutes: null, ...over })

const session = (over: Partial<Parameters<typeof makeFocusSession>[0]> = {}) =>
  makeFocusSession({ status: 'completed', started_at: at(TODAY), actual_seconds: 0, ...over })

const score = (tasks: ReturnType<typeof done>[] = [], sessions: ReturnType<typeof session>[] = []) =>
  computePoints({ tasks, sessions, todayStr: TODAY })

describe('an empty week scores nothing', () => {
  it('is 0 with no data at all', () => {
    const s = score()
    expect(s.total).toBe(0)
    expect(s.sources).toEqual([])
    expect(s.level.id).toBe('starting')
  })

  it('omits sources that contributed nothing rather than listing zeroes', () => {
    const s = score([done()])
    expect(s.sources.map((x) => x.id)).toEqual(['tasks'])
  })
})

describe('completed tasks', () => {
  it('pays a flat amount per task', () => {
    expect(score([done(), done(), done()]).total).toBe(3 * POINT_WEIGHTS.perCompletedTask)
  })

  it('ignores tasks that are not done', () => {
    const tasks = [
      makeTask({ status: 'todo', completed_at: null }),
      makeTask({ status: 'in_progress', completed_at: null }),
      makeTask({ status: 'cancelled', completed_at: at(TODAY) }),
    ]
    expect(computePoints({ tasks, sessions: [], todayStr: TODAY }).total).toBe(0)
  })

  it('ignores a done task with no completion timestamp', () => {
    expect(score([done({ completed_at: null })]).total).toBe(0)
  })

  it('adds effort points on top, weighted by the estimate', () => {
    // 60 minutes = 2 half-hours = 2 x perHalfHourOfEffort
    const expected = POINT_WEIGHTS.perCompletedTask + 2 * POINT_WEIGHTS.perHalfHourOfEffort
    expect(score([done({ effort_minutes: 60 })]).total).toBe(expected)
  })

  it('CAPS effort points per task, so one huge estimate cannot dwarf a real week', () => {
    const huge = score([done({ effort_minutes: 100_000 })])
    const effort = huge.sources.find((s) => s.id === 'effort')
    expect(effort?.points).toBe(POINT_WEIGHTS.maxEffortPointsPerTask)
  })

  it('cannot be farmed: doubling an already-capped estimate changes nothing', () => {
    const a = score([done({ effort_minutes: 600 })]).total
    const b = score([done({ effort_minutes: 1200 })]).total
    expect(a).toBe(b)
  })

  it('treats a null or zero estimate as no effort points, never negative', () => {
    expect(score([done({ effort_minutes: null })]).total).toBe(POINT_WEIGHTS.perCompletedTask)
    expect(score([done({ effort_minutes: 0 })]).total).toBe(POINT_WEIGHTS.perCompletedTask)
    expect(score([done({ effort_minutes: -30 })]).total).toBeGreaterThanOrEqual(0)
  })
})

describe('focus sessions', () => {
  it('pays per session plus per ten focused minutes', () => {
    // 30 minutes = 3 x perTenFocusMinutes
    const expected = POINT_WEIGHTS.perFocusSession + 3 * POINT_WEIGHTS.perTenFocusMinutes
    expect(score([], [session({ actual_seconds: 30 * 60 })]).total).toBe(expected)
  })

  it('counts only COMPLETED sessions — running and abandoned earn nothing', () => {
    const sessions = [
      session({ status: 'running', actual_seconds: 3600 }),
      session({ status: 'abandoned', actual_seconds: 3600 }),
    ]
    expect(computePoints({ tasks: [], sessions, todayStr: TODAY }).total).toBe(0)
  })
})

describe('the rolling window', () => {
  it('counts work inside the window', () => {
    const inside = [done({ completed_at: at(daysAgo(POINTS_WINDOW_DAYS - 1)) })]
    expect(computePoints({ tasks: inside, sessions: [], todayStr: TODAY }).total).toBeGreaterThan(0)
  })

  it('drops work older than the window — the score describes THIS week', () => {
    const old = [done({ completed_at: at(daysAgo(POINTS_WINDOW_DAYS)) })]
    expect(computePoints({ tasks: old, sessions: [], todayStr: TODAY }).total).toBe(0)
  })

  it('is boundary-exact on both sides', () => {
    const edge = daysAgo(POINTS_WINDOW_DAYS - 1)
    const past = daysAgo(POINTS_WINDOW_DAYS)
    expect(computePoints({ tasks: [done({ completed_at: at(edge) })], sessions: [], todayStr: TODAY }).total).toBe(
      POINT_WEIGHTS.perCompletedTask,
    )
    expect(computePoints({ tasks: [done({ completed_at: at(past) })], sessions: [], todayStr: TODAY }).total).toBe(0)
  })

  it('ignores work dated in the FUTURE rather than counting it early', () => {
    expect(score([done({ completed_at: at('2026-08-15') })]).total).toBe(0)
  })

  it('survives an unparseable timestamp without throwing', () => {
    expect(() => score([done({ completed_at: 'not-a-date' })])).not.toThrow()
    expect(score([done({ completed_at: 'not-a-date' })]).total).toBe(0)
  })

  it('reports the window it used', () => {
    expect(score().windowDays).toBe(POINTS_WINDOW_DAYS)
    expect(computePoints({ tasks: [], sessions: [], todayStr: TODAY, windowDays: 30 }).windowDays).toBe(30)
  })
})

describe('levels are bands, never a number that can be lost', () => {
  it('starts at the first band and only ever moves up with the score', () => {
    expect(levelFor(0).id).toBe('starting')
    expect(levelFor(149).id).toBe('starting')
    expect(levelFor(150).id).toBe('steady')
    expect(levelFor(399).id).toBe('steady')
    expect(levelFor(400).id).toBe('rolling')
    expect(levelFor(800).id).toBe('flying')
    expect(levelFor(100_000).id).toBe('flying')
  })

  it('is monotonic — a higher score is never a lower band', () => {
    let lastIndex = 0
    for (let total = 0; total <= 1200; total += 7) {
      const index = POINT_LEVELS.findIndex((l) => l.id === levelFor(total).id)
      expect(index, `score ${total}`).toBeGreaterThanOrEqual(lastIndex)
      lastIndex = index
    }
  })

  it('bands ascend and start at zero, so every score has one', () => {
    expect(POINT_LEVELS[0].min).toBe(0)
    for (let i = 1; i < POINT_LEVELS.length; i++) {
      expect(POINT_LEVELS[i].min).toBeGreaterThan(POINT_LEVELS[i - 1].min)
    }
  })

  it('counts down to the next band and stops at the top', () => {
    expect(pointsToNextLevel(0)).toBe(150)
    expect(pointsToNextLevel(149)).toBe(1)
    expect(pointsToNextLevel(150)).toBe(250)
    expect(pointsToNextLevel(800)).toBeNull()
    expect(pointsToNextLevel(5000)).toBeNull()
  })

  it('never labels a band with a verdict', () => {
    for (const l of POINT_LEVELS) {
      expect(l.label).not.toMatch(/lazy|behind|poor|bad|fail|slack|weak/i)
      // Not "Level 3": a numbered level implies progression a rolling score
      // cannot honestly offer, and going DOWN a level is the shaming this avoids.
      expect(l.label).not.toMatch(/level\s*\d/i)
    }
  })
})

describe('the breakdown', () => {
  it('lists the biggest contributor first and sums to the total', () => {
    const s = score(
      [done({ effort_minutes: 120 }), done({ effort_minutes: 30 })],
      [session({ actual_seconds: 50 * 60 })],
    )
    const summed = s.sources.reduce((n, x) => n + x.points, 0)
    expect(summed).toBe(s.total)
    for (let i = 1; i < s.sources.length; i++) {
      expect(s.sources[i - 1].points).toBeGreaterThanOrEqual(s.sources[i].points)
    }
  })

  it('never reports a negative total', () => {
    expect(score([done({ effort_minutes: -999 })]).total).toBeGreaterThanOrEqual(0)
  })
})
