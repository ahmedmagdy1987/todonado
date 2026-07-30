import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { QuitCheckin } from '@/types/database'
import {
  QUIT_MILESTONES,
  bestStreak,
  checkedDaysForHabit,
  checkinStreak,
  cleanDays,
  cleanDaysLabel,
  cleanElapsed,
  dayOf,
  daysBetween,
  daysToNextMilestone,
  isMilestoneDay,
  lastMilestone,
  milestoneProgress,
  nextMilestone,
  shiftDay,
  slipPatch,
} from './quitMath'

/**
 * Every `now` and every day-zero in this file is built with the LOCAL `Date`
 * constructor, never a `Z`-suffixed literal. The functions under test count
 * LOCAL calendar days, so a UTC literal would make the expected values depend
 * on the machine's timezone and the suite would pass in London and fail in
 * Auckland. Built locally, these assertions hold in every timezone.
 */

/**
 * The DST assertions below are only meaningful in a timezone that HAS a DST
 * transition, so one is pinned for the whole file rather than trusting whatever
 * the machine (or CI, which runs UTC) happens to be set to. Everything else here
 * builds its dates with the LOCAL constructor, so pinning is safe for all of it.
 */
const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/New_York'
})
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

/** Local timestamp → the ISO string the DB would hold. */
const at = (y: number, m: number, d: number, h = 9, min = 0): string =>
  new Date(y, m - 1, d, h, min).toISOString()

const local = (y: number, m: number, d: number, h = 9, min = 0): Date =>
  new Date(y, m - 1, d, h, min)

describe('dayOf / shiftDay', () => {
  it('formats a local calendar day', () => {
    expect(dayOf(local(2026, 7, 30, 23, 59))).toBe('2026-07-30')
    expect(dayOf(local(2026, 1, 1, 0, 0))).toBe('2026-01-01')
  })

  it('moves by whole days across month and year boundaries', () => {
    expect(shiftDay('2026-07-30', 1)).toBe('2026-07-31')
    expect(shiftDay('2026-07-01', -1)).toBe('2026-06-30')
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles a leap day', () => {
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29')
    expect(shiftDay('2028-02-29', 1)).toBe('2028-03-01')
  })
})

describe('daysBetween', () => {
  it('counts whole calendar days', () => {
    expect(daysBetween('2026-07-30', '2026-07-30')).toBe(0)
    expect(daysBetween('2026-07-30', '2026-07-31')).toBe(1)
    expect(daysBetween('2026-07-01', '2026-07-31')).toBe(30)
  })

  it('is negative when b precedes a', () => {
    expect(daysBetween('2026-07-31', '2026-07-30')).toBe(-1)
  })

  it('counts a full non-leap year as 365 days', () => {
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
  })

  it('counts a leap year as 366 days', () => {
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366)
  })

  it('is DST-proof: a 23- or 25-hour day still counts as one day', () => {
    // US spring-forward (23h local day) and fall-back (25h local day).
    expect(daysBetween('2026-03-08', '2026-03-09')).toBe(1)
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1)
    // EU transitions, same property.
    expect(daysBetween('2026-03-29', '2026-03-30')).toBe(1)
    expect(daysBetween('2026-10-25', '2026-10-26')).toBe(1)
    // A span crossing BOTH US transitions is still exactly the calendar count.
    expect(daysBetween('2026-03-01', '2026-12-01')).toBe(275)
  })
})

describe('cleanDays', () => {
  it('is 0 on the day you quit and 1 on the next calendar day', () => {
    const zero = at(2026, 7, 30, 9)
    expect(cleanDays(zero, local(2026, 7, 30, 23, 59))).toBe(0)
    expect(cleanDays(zero, local(2026, 7, 31, 0, 1))).toBe(1)
  })

  it('counts calendar days, not 24-hour blocks (the 11pm case)', () => {
    // Quit at 23:00, look at 01:00 the next night: two hours elapsed, but it is
    // a new calendar day, so the headline reads day 1 — the documented rule.
    const zero = at(2026, 7, 30, 23, 0)
    expect(cleanDays(zero, local(2026, 7, 31, 1, 0))).toBe(1)
  })

  it('never goes negative for a future day zero (clock skew)', () => {
    expect(cleanDays(at(2026, 8, 5), local(2026, 7, 30))).toBe(0)
  })

  it('grows while the app is closed', () => {
    expect(cleanDays(at(2026, 7, 1), local(2026, 7, 31))).toBe(30)
  })
})

describe('cleanElapsed', () => {
  it('splits real elapsed time', () => {
    const zero = at(2026, 7, 30, 10, 0)
    const e = cleanElapsed(zero, local(2026, 8, 2, 13, 30))
    expect(e).toEqual({ days: 3, hours: 3, minutes: 30, seconds: 0 })
  })

  it('is all zeroes at day zero and clamps a future timestamp', () => {
    const zero = at(2026, 7, 30, 10, 0)
    expect(cleanElapsed(zero, local(2026, 7, 30, 10, 0))).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    })
    expect(cleanElapsed(at(2026, 8, 5), local(2026, 7, 30))).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    })
  })

  it('deliberately disagrees with cleanDays inside a day', () => {
    // The clock shows 2 elapsed hours (0 whole 24h blocks) while the calendar
    // count is already 1. Both are correct; the card shows both.
    const zero = at(2026, 7, 30, 23, 0)
    const now = local(2026, 7, 31, 1, 0)
    expect(cleanElapsed(zero, now).days).toBe(0)
    expect(cleanDays(zero, now)).toBe(1)
  })
})

describe('milestones', () => {
  it('is a fixed ascending list', () => {
    expect([...QUIT_MILESTONES]).toEqual([1, 3, 7, 14, 30, 90, 180, 365])
    const sorted = [...QUIT_MILESTONES].sort((a, b) => a - b)
    expect([...QUIT_MILESTONES]).toEqual(sorted)
  })

  it('isMilestoneDay is exact on the boundary, never off by one', () => {
    // No two milestones are adjacent, so BOTH neighbours of every boundary must
    // be non-milestones. This is the off-by-one guard: a `>=` slip in
    // isMilestoneDay would light up day 8 as well as day 7.
    for (const m of QUIT_MILESTONES) {
      expect(isMilestoneDay(m), `day ${m} is a milestone`).toBe(true)
      expect(isMilestoneDay(m - 1), `day ${m - 1} is not a milestone`).toBe(false)
      expect(isMilestoneDay(m + 1), `day ${m + 1} is not a milestone`).toBe(false)
    }
    // And the same boundaries spelled out literally, so a change to the list
    // cannot silently satisfy the loop above.
    expect(isMilestoneDay(0)).toBe(false)
    expect(isMilestoneDay(2)).toBe(false)
    expect(isMilestoneDay(6)).toBe(false)
    expect(isMilestoneDay(8)).toBe(false)
    expect(isMilestoneDay(13)).toBe(false)
    expect(isMilestoneDay(15)).toBe(false)
    expect(isMilestoneDay(29)).toBe(false)
    expect(isMilestoneDay(31)).toBe(false)
    expect(isMilestoneDay(364)).toBe(false)
    expect(isMilestoneDay(366)).toBe(false)
  })

  it('lastMilestone is null before the first and sticks afterwards', () => {
    expect(lastMilestone(0)).toBeNull()
    expect(lastMilestone(1)).toBe(1)
    expect(lastMilestone(2)).toBe(1)
    expect(lastMilestone(6)).toBe(3)
    expect(lastMilestone(7)).toBe(7)
    expect(lastMilestone(365)).toBe(365)
    expect(lastMilestone(4000)).toBe(365)
  })

  it('nextMilestone walks forward and ends at null', () => {
    expect(nextMilestone(0)).toBe(1)
    expect(nextMilestone(1)).toBe(3)
    expect(nextMilestone(3)).toBe(7)
    expect(nextMilestone(29)).toBe(30)
    expect(nextMilestone(364)).toBe(365)
    expect(nextMilestone(365)).toBeNull()
    expect(nextMilestone(4000)).toBeNull()
  })

  it('daysToNextMilestone is always at least 1 until there are none left', () => {
    expect(daysToNextMilestone(0)).toBe(1)
    expect(daysToNextMilestone(2)).toBe(1)
    expect(daysToNextMilestone(7)).toBe(7) // day 7 → day 14
    expect(daysToNextMilestone(365)).toBeNull()
  })

  it('milestoneProgress stays inside 0..1 and resets at each milestone', () => {
    expect(milestoneProgress(0)).toBe(0)
    expect(milestoneProgress(1)).toBe(0) // just hit 1, 2 days to go to 3
    expect(milestoneProgress(2)).toBe(0.5)
    expect(milestoneProgress(3)).toBe(0)
    expect(milestoneProgress(5)).toBeCloseTo(0.5, 5)
    expect(milestoneProgress(365)).toBe(1)
    expect(milestoneProgress(4000)).toBe(1)
    for (let d = 0; d <= 400; d++) {
      const p = milestoneProgress(d)
      expect(p, `progress at day ${d}`).toBeGreaterThanOrEqual(0)
      expect(p, `progress at day ${d}`).toBeLessThanOrEqual(1)
    }
  })
})

describe('slipPatch — the no-shame reset', () => {
  it('moves day zero to now', () => {
    const now = local(2026, 7, 30, 14, 0)
    const patch = slipPatch(at(2026, 7, 20), 0, now)
    expect(patch.quit_started_at).toBe(now.toISOString())
  })

  it('banks the run just completed when it beat the record', () => {
    const now = local(2026, 7, 30)
    expect(slipPatch(at(2026, 7, 20), 3, now).longest_streak_days).toBe(10)
  })

  it('leaves a bigger record alone — it only ever goes UP', () => {
    const now = local(2026, 7, 30)
    expect(slipPatch(at(2026, 7, 28), 40, now).longest_streak_days).toBe(40)
  })

  it('is a no-op on the record when you slip on day zero', () => {
    const now = local(2026, 7, 30, 18, 0)
    expect(slipPatch(at(2026, 7, 30, 9, 0), 0, now).longest_streak_days).toBe(0)
    expect(slipPatch(at(2026, 7, 30, 9, 0), 12, now).longest_streak_days).toBe(12)
  })

  it('never decreases the record across a chain of slips', () => {
    let quitStartedAt = at(2026, 1, 1)
    let longest = 0
    const slips: Array<[Date, number]> = [
      [local(2026, 1, 21), 20],
      [local(2026, 1, 23), 20], // a 2-day run cannot lower the 20-day record
      [local(2026, 3, 24), 60],
      [local(2026, 3, 25), 60],
    ]
    for (const [when, expected] of slips) {
      const patch = slipPatch(quitStartedAt, longest, when)
      expect(patch.longest_streak_days).toBe(expected)
      expect(patch.longest_streak_days).toBeGreaterThanOrEqual(longest)
      quitStartedAt = patch.quit_started_at
      longest = patch.longest_streak_days
    }
  })
})

describe('bestStreak', () => {
  it('shows the run in progress once it overtakes the record', () => {
    const now = local(2026, 7, 30)
    expect(bestStreak(at(2026, 7, 20), 3, now)).toBe(10)
  })

  it('shows the stored record while it is still ahead', () => {
    const now = local(2026, 7, 30)
    expect(bestStreak(at(2026, 7, 28), 40, now)).toBe(40)
  })

  it('is 0 for a brand-new habit', () => {
    const now = local(2026, 7, 30, 12, 0)
    expect(bestStreak(at(2026, 7, 30, 9, 0), 0, now)).toBe(0)
  })
})

describe('check-ins', () => {
  const checkin = (habit_id: string, checked_on: string): QuitCheckin => ({
    id: `${habit_id}-${checked_on}`,
    user_id: 'u1',
    habit_id,
    checked_on,
    created_at: `${checked_on}T09:00:00.000Z`,
  })

  it('checkedDaysForHabit filters by habit and dedupes', () => {
    const rows = [
      checkin('a', '2026-07-30'),
      checkin('a', '2026-07-29'),
      checkin('b', '2026-07-30'),
    ]
    expect([...checkedDaysForHabit(rows, 'a')].sort()).toEqual(['2026-07-29', '2026-07-30'])
    expect(checkedDaysForHabit(rows, 'b').size).toBe(1)
    expect(checkedDaysForHabit(rows, 'missing').size).toBe(0)
  })

  it('counts consecutive days ending today', () => {
    const days = new Set(['2026-07-28', '2026-07-29', '2026-07-30'])
    expect(checkinStreak(days, '2026-07-30')).toBe(3)
  })

  it('still counts a run ending yesterday — the day is not over', () => {
    expect(checkinStreak(new Set(['2026-07-28', '2026-07-29']), '2026-07-30')).toBe(2)
  })

  it('is 0 when neither today nor yesterday was checked', () => {
    expect(checkinStreak(new Set(['2026-07-27']), '2026-07-30')).toBe(0)
    expect(checkinStreak(new Set<string>(), '2026-07-30')).toBe(0)
  })

  it('stops at the first gap', () => {
    const days = new Set(['2026-07-26', '2026-07-27', '2026-07-29', '2026-07-30'])
    expect(checkinStreak(days, '2026-07-30')).toBe(2)
  })

  it('crosses a month boundary', () => {
    const days = new Set(['2026-06-29', '2026-06-30', '2026-07-01'])
    expect(checkinStreak(days, '2026-07-01')).toBe(3)
  })
})

describe('cleanDaysLabel', () => {
  it('never scolds and never celebrates day zero', () => {
    expect(cleanDaysLabel(0)).toBe('Day zero — today counts')
    expect(cleanDaysLabel(1)).toBe('1 day clean')
    expect(cleanDaysLabel(2)).toBe('2 days clean')
    expect(cleanDaysLabel(365)).toBe('365 days clean')
  })

  it('carries no exclamation marks or emoji anywhere', () => {
    for (const d of [0, 1, 2, 7, 30, 365]) {
      expect(cleanDaysLabel(d)).not.toMatch(/[!🎉🔥]/u)
    }
  })
})
