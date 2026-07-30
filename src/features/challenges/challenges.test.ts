import { describe, expect, it } from 'vitest'
import type { FocusSession, QuitHabit, Task } from '@/types/database'
import {
  CHALLENGES,
  type ChallengeData,
  type ChallengeKey,
  canJoinChallenge,
  challengeFor,
  challengeProgress,
  challengeTerms,
  daysLeft,
  elapsedDays,
  lastDayOf,
  offerableChallenges,
  phaseOf,
  progressLabel,
} from './challenges'

/**
 * The metrics are the whole feature, so they are tested against fixtures rather
 * than trusted. The property that matters most is the one asserted last: a
 * challenge NEVER counts a day that has not happened yet, so a part-finished
 * attempt reads "3 of 7" rather than looking already failed.
 */

const START = '2026-03-02' // a Monday
const day = (n: number) => {
  const d = new Date(`${START}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36).slice(2),
    workspace_id: 'w',
    project_id: null,
    section_id: null,
    title: 't',
    notes: null,
    status: 'todo',
    priority: 0,
    due_date: null,
    effort_minutes: null,
    scheduled_for: null,
    position: 0,
    recurrence_freq: null,
    recurrence_interval: 1,
    recurrence_weekdays: null,
    recurrence_until: null,
    recurrence_anchor: null,
    created_at: `${START}T08:00:00.000Z`,
    updated_at: `${START}T08:00:00.000Z`,
    completed_at: null,
    ...over,
  } as Task
}

/** Completed at local noon on the given day — timezone-safe for the day key. */
function doneOn(dayStr: string, over: Partial<Task> = {}): Task {
  return task({ status: 'done', completed_at: `${dayStr}T12:00:00`, ...over })
}

function session(dayStr: string, minutes: number, status: FocusSession['status'] = 'completed'): FocusSession {
  return {
    id: Math.random().toString(36).slice(2),
    workspace_id: 'w',
    task_id: null,
    planned_minutes: minutes,
    started_at: `${dayStr}T09:00:00`,
    ended_at: `${dayStr}T09:${String(minutes).padStart(2, '0')}:00`,
    actual_seconds: minutes * 60,
    interruptions: 0,
    status,
    paused_at: null,
    accumulated_paused_seconds: 0,
    created_at: `${dayStr}T09:00:00`,
    updated_at: `${dayStr}T09:00:00`,
  } as FocusSession
}

function habit(quitStartedDay: string): QuitHabit {
  return {
    id: 'h1',
    user_id: 'u',
    name: 'x',
    preset_key: 'custom',
    quit_started_at: `${quitStartedDay}T07:00:00`,
    longest_streak_days: 0,
    replacement_action: null,
    notes: null,
    created_at: `${quitStartedDay}T07:00:00`,
    updated_at: `${quitStartedDay}T07:00:00`,
  }
}

const emptyData = (over: Partial<ChallengeData> = {}): ChallengeData => ({
  tasks: [],
  sessions: [],
  quitHabits: [],
  journalDays: [],
  capacityMinutes: 360,
  ...over,
})

const get = (key: ChallengeKey) => challengeFor(key)!
const progress = (key: ChallengeKey, data: ChallengeData, todayStr: string) =>
  challengeProgress(get(key), START, data, todayStr)

describe('the catalog', () => {
  it('offers between 8 and 12 challenges, with unique keys', () => {
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(8)
    expect(CHALLENGES.length).toBeLessThanOrEqual(12)
    const keys = CHALLENGES.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gives every challenge a target it can actually reach in its window', () => {
    for (const c of CHALLENGES) {
      expect(c.target, c.key).toBeGreaterThan(0)
      expect(c.durationDays, c.key).toBeGreaterThan(0)
      // A day-counting challenge cannot ask for more days than the window has.
      if (c.unit === 'days' || c.unit === 'entries') {
        expect(c.target, `${c.key} asks for more days than it allows`).toBeLessThanOrEqual(
          c.durationDays,
        )
      }
    }
  })

  it('gives every challenge a one-line goal and an icon', () => {
    for (const c of CHALLENGES) {
      expect(c.goal.length, c.key).toBeGreaterThan(10)
      expect(c.goal.endsWith('.'), c.key).toBe(true)
      expect(typeof c.icon).not.toBe('undefined')
    }
  })

  it('reads only sources the app already has', () => {
    // The constraint that keeps this feature from growing tracking machinery.
    for (const c of CHALLENGES) {
      expect(['tasks', 'focus', 'quit', 'journal']).toContain(c.source)
    }
  })

  it('returns null for an unknown key rather than throwing', () => {
    expect(challengeFor('nope')).toBeNull()
  })
})

describe('windows', () => {
  it('counts only days that have actually happened', () => {
    expect(elapsedDays(START, 7, day(2))).toEqual([day(0), day(1), day(2)])
    expect(elapsedDays(START, 7, day(30))).toHaveLength(7)
    // Joined today: one day has happened, not zero.
    expect(elapsedDays(START, 7, START)).toEqual([START])
  })

  it('knows the last day an attempt can still count', () => {
    expect(lastDayOf(START, 7)).toBe(day(6))
    expect(lastDayOf(START, 1)).toBe(START)
  })

  it('reports days left, floored at zero', () => {
    expect(daysLeft(START, 7, START)).toBe(6)
    expect(daysLeft(START, 7, day(6))).toBe(0)
    expect(daysLeft(START, 7, day(99))).toBe(0)
  })
})

describe('metrics — each derived from data that already exists', () => {
  it('plan_7 counts days with something scheduled OR completed', () => {
    const data = emptyData({
      tasks: [
        task({ scheduled_for: day(0) }),
        doneOn(day(1)),
        task({ scheduled_for: day(1) }), // same day again — not double-counted
        task({ scheduled_for: day(9) }), // outside the window
      ],
    })
    expect(progress('plan_7', data, day(6)).current).toBe(2)
  })

  it('capacity_7 counts planned days that FIT, and never an empty day', () => {
    const data = emptyData({
      capacityMinutes: 360,
      tasks: [
        task({ scheduled_for: day(0), effort_minutes: 120 }),
        task({ scheduled_for: day(0), effort_minutes: 120 }), // 240 ≤ 360 ✓
        task({ scheduled_for: day(1), effort_minutes: 400 }), // over ✗
        task({ scheduled_for: day(2), effort_minutes: 360 }), // exactly ✓
      ],
    })
    const p = progress('capacity_7', data, day(6))
    // day 0 and day 2. Days 3-6 are empty and must NOT score — "inside your
    // capacity" has to mean you planned something.
    expect(p.current).toBe(2)
  })

  it('estimate_7 needs EVERY task on the day to carry an estimate', () => {
    const data = emptyData({
      tasks: [
        task({ scheduled_for: day(0), effort_minutes: 30 }),
        task({ scheduled_for: day(0), effort_minutes: 60 }), // all estimated ✓
        task({ scheduled_for: day(1), effort_minutes: 30 }),
        task({ scheduled_for: day(1) }), // one bare task spoils the day ✗
      ],
    })
    expect(progress('estimate_7', data, day(6)).current).toBe(1)
  })

  it('estimate_7 does not reward a day with no tasks at all', () => {
    expect(progress('estimate_7', emptyData(), day(6)).current).toBe(0)
  })

  it('tasks_50 counts completions inside the window only', () => {
    const data = emptyData({
      tasks: [
        ...Array.from({ length: 5 }, () => doneOn(day(1))),
        ...Array.from({ length: 3 }, () => doneOn(day(40))), // past the window
        task({ scheduled_for: day(1) }), // not done
      ],
    })
    expect(progress('tasks_50', data, day(29)).current).toBe(5)
  })

  it('focus_10 counts only FINISHED sessions', () => {
    const data = emptyData({
      sessions: [
        session(day(0), 25),
        session(day(0), 25),
        session(day(1), 25, 'abandoned'),
        session(day(1), 25, 'running'),
      ],
    })
    expect(progress('focus_10', data, day(6)).current).toBe(2)
  })

  it('focus_minutes_300 sums real focused minutes', () => {
    const data = emptyData({ sessions: [session(day(0), 25), session(day(1), 50)] })
    expect(progress('focus_minutes_300', data, day(6)).current).toBe(75)
  })

  it('focus_days_5 counts DAYS, not sessions', () => {
    const data = emptyData({
      sessions: [session(day(0), 25), session(day(0), 25), session(day(0), 25), session(day(3), 25)],
    })
    expect(progress('focus_days_5', data, day(6)).current).toBe(2)
  })

  it('quit_30 counts days on or after the current day zero', () => {
    // Clean since the day it started: every elapsed day counts.
    const clean = emptyData({ quitHabits: [habit(START)] })
    expect(progress('quit_30', clean, day(9)).current).toBe(10)

    // A SLIP moved day zero forward — earlier days stop counting. That is the
    // challenge being honest, and it can be restarted the same afternoon.
    const slipped = emptyData({ quitHabits: [habit(day(7))] })
    expect(progress('quit_30', slipped, day(9)).current).toBe(3)
  })

  it('quit_30 uses the LONGEST run still going when several habits are tracked', () => {
    const data = emptyData({ quitHabits: [habit(day(5)), habit(START), habit(day(8))] })
    expect(progress('quit_30', data, day(9)).current).toBe(10)
  })

  it('quit_30 is zero with nothing tracked, rather than throwing', () => {
    expect(progress('quit_30', emptyData(), day(9)).current).toBe(0)
  })

  it('journal_7 counts distinct days written in', () => {
    const data = emptyData({ journalDays: [day(0), day(1), day(1), day(20)] })
    expect(progress('journal_7', data, day(13)).current).toBe(2)
  })

  it('caps at the target and never reports more than 100%', () => {
    const data = emptyData({ sessions: Array.from({ length: 40 }, () => session(day(0), 25)) })
    const p = progress('focus_10', data, day(6))
    expect(p.current).toBe(10)
    expect(p.ratio).toBe(1)
    expect(p.done).toBe(true)
  })

  it('NEVER counts a day that has not happened yet', () => {
    // The property the whole design rests on: on day 1 of a 7-day challenge a
    // user has done 1 of 7, not failed 6.
    const data = emptyData({ tasks: [task({ scheduled_for: START })] })
    const p = progress('plan_7', data, START)
    expect(p.current).toBe(1)
    expect(p.done).toBe(false)
    expect(p.ratio).toBeCloseTo(1 / 7, 6)
  })
})

describe('phases', () => {
  const c = get('plan_7')
  const none = { current: 0, target: 7, ratio: 0, done: false }
  const full = { current: 7, target: 7, ratio: 1, done: true }

  it('is active inside the window', () => {
    expect(phaseOf({ status: 'active', started_at: START }, c, none, day(3))).toBe('active')
    // The last day still counts.
    expect(phaseOf({ status: 'active', started_at: START }, c, none, day(6))).toBe('active')
  })

  it('is done as soon as the target is reached, without waiting for the row', () => {
    expect(phaseOf({ status: 'active', started_at: START }, c, full, day(3))).toBe('done')
    expect(phaseOf({ status: 'completed', started_at: START }, c, none, day(99))).toBe('done')
  })

  it('ENDS quietly when the window passes — never "failed"', () => {
    expect(phaseOf({ status: 'active', started_at: START }, c, none, day(7))).toBe('ended')
  })

  it('respects an explicit leave', () => {
    expect(phaseOf({ status: 'abandoned', started_at: START }, c, full, day(3))).toBe('left')
  })
})

describe('what may be offered', () => {
  it('hides the quit challenge when nothing is being tracked', () => {
    const keys = offerableChallenges({ hasQuitHabit: false, journalAvailable: true }).map((c) => c.key)
    expect(keys).not.toContain('quit_30')
    expect(keys).toContain('journal_7')
  })

  it('hides the journal challenge until the journal is switched on', () => {
    const keys = offerableChallenges({ hasQuitHabit: true, journalAvailable: false }).map((c) => c.key)
    expect(keys).not.toContain('journal_7')
    expect(keys).toContain('quit_30')
  })

  it('offers everything once both exist', () => {
    expect(offerableChallenges({ hasQuitHabit: true, journalAvailable: true })).toHaveLength(
      CHALLENGES.length,
    )
  })
})

describe('the Free limit', () => {
  it('counts only RUNNING attempts, so a finished one never blocks a new one', () => {
    expect(canJoinChallenge(0, false, 1)).toBe(true)
    expect(canJoinChallenge(1, false, 1)).toBe(false)
    expect(canJoinChallenge(9, true, 1)).toBe(true)
  })
})

describe('labels', () => {
  it('reads plainly', () => {
    expect(progressLabel({ current: 3, target: 7, ratio: 3 / 7, done: false }, 'days')).toBe(
      '3 of 7 days',
    )
  })

  it('states the terms without saying the same thing twice', () => {
    // The naive version rendered "7 days · 7 days" for every day-counting
    // challenge, which is how this special case earned its place.
    expect(challengeTerms(get('plan_7'))).toBe('every day for 7 days')
    expect(challengeTerms(get('focus_days_5'))).toBe('5 days out of 7')
    expect(challengeTerms(get('tasks_50'))).toBe('50 tasks in 30 days')
    expect(challengeTerms(get('focus_minutes_300'))).toBe('300 minutes in 7 days')
  })

  it('never renders the same unit twice in one line', () => {
    for (const c of CHALLENGES) {
      const terms = challengeTerms(c)
      // The regression guard for "7 days · 7 days". Counted by splitting
      // rather than by a word-boundary regex, which keeps the assertion
      // readable and sidesteps shell escaping entirely.
      const daysMentions = terms.split(' days').length - 1
      expect(daysMentions, `${c.key}: "${terms}"`).toBeLessThanOrEqual(1)
    }
  })
})
