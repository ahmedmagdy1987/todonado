import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeTask } from '@/test/factories'
import {
  historyCutoffDay,
  isWithinHistoryWindow,
  localDay,
  windowDayKeys,
  windowTaskHistory,
} from './historyWindow'

/**
 * Pin a known timezone for the whole file.
 *
 * The window is deliberately evaluated in the USER'S LOCAL day (see the
 * "local-day correctness" block below, which proves it), so a fixture written as
 * `...T12:00:00Z` only lands on the day its name claims in zones near UTC. Left
 * unpinned, these assertions would pass in UTC/CI and fail in UTC+12 — which is
 * exactly what happened while writing them. Pinning keeps the day fixtures
 * meaningful; the timezone behaviour itself is asserted explicitly.
 */
const originalTZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/New_York'
})
afterAll(() => {
  process.env.TZ = originalTZ
})

/** A completed task finished on the given LOCAL day at midday (avoids edge ambiguity). */
const doneOn = (day: string | null) =>
  makeTask({ status: 'done', completed_at: day ? `${day}T12:00:00.000Z` : null })

describe('historyCutoffDay', () => {
  it('spans N calendar days counting today', () => {
    // 14 days of history ⇒ today plus the 13 days before it.
    expect(historyCutoffDay(14, '2026-07-28')).toBe('2026-07-15')
  })

  it('treats a 1-day window as today only', () => {
    expect(historyCutoffDay(1, '2026-07-28')).toBe('2026-07-28')
  })

  it('crosses month and year boundaries', () => {
    expect(historyCutoffDay(14, '2026-01-05')).toBe('2025-12-23')
    expect(historyCutoffDay(14, '2026-03-05')).toBe('2026-02-20') // Feb, non-leap
    expect(historyCutoffDay(14, '2024-03-05')).toBe('2024-02-21') // Feb, leap year
  })

  it('clamps a nonsensical window instead of inverting it', () => {
    expect(historyCutoffDay(0, '2026-07-28')).toBe('2026-07-28')
    expect(historyCutoffDay(-5, '2026-07-28')).toBe('2026-07-28')
  })
})

describe('local-day correctness across timezones', () => {
  afterAll(() => {
    process.env.TZ = 'America/New_York' // restore the file-wide pin
  })

  it('windows by the USER LOCAL day, not the UTC day', () => {
    // ONE instant, two zones:
    //   New York  (UTC-4)  → 2026-07-14 08:00 local ⇒ day 2026-07-14 (outside)
    //   Auckland  (UTC+12) → 2026-07-15 00:00 local ⇒ day 2026-07-15 (inside)
    const instant = '2026-07-14T12:00:00.000Z'
    const cutoff = '2026-07-15'

    process.env.TZ = 'America/New_York'
    expect(localDay(instant)).toBe('2026-07-14')
    expect(isWithinHistoryWindow(instant, cutoff)).toBe(false)

    process.env.TZ = 'Pacific/Auckland'
    expect(localDay(instant)).toBe('2026-07-15')
    expect(isWithinHistoryWindow(instant, cutoff)).toBe(true)
  })
})

describe('historyCutoffDay across a DST transition', () => {
  it('stays exactly N calendar days across spring-forward', () => {
    // US DST began 2026-03-08. A 14-day window from 2026-03-15 must still land
    // on 2026-03-02 — calendar-day arithmetic, not days * 24h.
    expect(historyCutoffDay(14, '2026-03-15')).toBe('2026-03-02')
  })

  it('stays exactly N calendar days across fall-back', () => {
    // US DST ended 2026-11-01.
    expect(historyCutoffDay(14, '2026-11-07')).toBe('2026-10-25')
  })
})

/*
 * A FIXED 14 HERE, DELIBERATELY, RATHER THAN THE LIVE FREE WINDOW.
 *
 * What these two blocks test is the WINDOWING FUNCTION: given a cutoff day, is
 * this date inside it. That behaviour has nothing to do with how many days the
 * Free plan happens to grant, and wiring the live constant in meant every one
 * of these dated assertions silently re-anchored the day the commercial number
 * changed. It did: raising the Free window from 14 to 30 days moved the cutoff
 * from 2026-07-15 to 2026-06-29 and broke four tests that were not about
 * pricing at all.
 *
 * The Free number is asserted where it belongs, in the entitlement contract
 * test. Here the window is an argument.
 */
const WINDOW_DAYS = 14

describe('isWithinHistoryWindow', () => {
  const cutoff = historyCutoffDay(WINDOW_DAYS, '2026-07-28') // 2026-07-15

  it('is unlimited when there is no cutoff (Pro)', () => {
    expect(isWithinHistoryWindow('2019-01-01T00:00:00.000Z', null)).toBe(true)
  })

  it('includes the cutoff day itself and excludes the day before', () => {
    expect(isWithinHistoryWindow('2026-07-15T12:00:00.000Z', cutoff)).toBe(true)
    expect(isWithinHistoryWindow('2026-07-14T12:00:00.000Z', cutoff)).toBe(false)
  })

  it('hides work completed EXACTLY 14 days ago and keeps 13 days ago', () => {
    expect(isWithinHistoryWindow('2026-07-14T12:00:00.000Z', cutoff)).toBe(false) // 14 days
    expect(isWithinHistoryWindow('2026-07-15T12:00:00.000Z', cutoff)).toBe(true) // 13 days
  })

  it('keeps today and never hides the future', () => {
    expect(isWithinHistoryWindow('2026-07-28T09:00:00.000Z', cutoff)).toBe(true)
    expect(isWithinHistoryWindow('2026-08-01T09:00:00.000Z', cutoff)).toBe(true)
  })

  it('keeps an undated completion — we hide only what we can prove is old', () => {
    expect(isWithinHistoryWindow(null, cutoff)).toBe(true)
    expect(isWithinHistoryWindow(undefined, cutoff)).toBe(true)
    expect(isWithinHistoryWindow('not-a-timestamp', cutoff)).toBe(true)
  })
})

describe('localDay', () => {
  it('returns null for missing or unparseable input', () => {
    expect(localDay(null)).toBeNull()
    expect(localDay(undefined)).toBeNull()
    expect(localDay('')).toBeNull()
    expect(localDay('nonsense')).toBeNull()
  })
})

describe('windowTaskHistory', () => {
  const cutoff = historyCutoffDay(WINDOW_DAYS, '2026-07-28') // 2026-07-15

  it('is an identity for Pro (no cutoff) — upgrading reveals everything', () => {
    const tasks = [doneOn('2019-01-01'), doneOn('2026-07-28')]
    const result = windowTaskHistory(tasks, null)
    expect(result.visible).toBe(tasks) // same reference: nothing copied, nothing filtered
    expect(result.hiddenCount).toBe(0)
  })

  it('hides only completed work older than the window', () => {
    const fresh = doneOn('2026-07-20')
    const old = doneOn('2026-07-01')
    const { visible, hiddenCount } = windowTaskHistory([fresh, old], cutoff)
    expect(visible).toEqual([fresh])
    expect(hiddenCount).toBe(1)
  })

  it('NEVER hides an open task, however old — planning is untouched', () => {
    const ancientTodo = makeTask({ status: 'todo', created_at: '2019-01-01T00:00:00.000Z' })
    const ancientInProgress = makeTask({ status: 'in_progress', created_at: '2019-01-01T00:00:00.000Z' })
    // An open task can even carry a stale completed_at (completed then reopened).
    const reopened = makeTask({ status: 'todo', completed_at: '2019-01-01T00:00:00.000Z' })
    const { visible, hiddenCount } = windowTaskHistory(
      [ancientTodo, ancientInProgress, reopened],
      cutoff,
    )
    expect(visible).toHaveLength(3)
    expect(hiddenCount).toBe(0)
  })

  it('reports nothing to cut for a brand-new user (first-run is never limited)', () => {
    // Everything a user could have done in their first days is inside the window.
    const day1 = doneOn('2026-07-28')
    const day2 = doneOn('2026-07-27')
    const { visible, hiddenCount } = windowTaskHistory([day1, day2], cutoff)
    expect(visible).toHaveLength(2)
    expect(hiddenCount).toBe(0)
  })

  it('handles an empty history', () => {
    expect(windowTaskHistory([], cutoff)).toEqual({ visible: [], hiddenCount: 0 })
    expect(windowTaskHistory([], null)).toEqual({ visible: [], hiddenCount: 0 })
  })

  it('preserves the incoming order of what stays visible', () => {
    const a = doneOn('2026-07-28')
    const b = doneOn('2026-07-01') // hidden
    const c = doneOn('2026-07-20')
    const { visible } = windowTaskHistory([a, b, c], cutoff)
    expect(visible).toEqual([a, c])
  })
})

describe('windowDayKeys', () => {
  it('is an identity without a cutoff', () => {
    const days = new Set(['2019-01-01'])
    expect(windowDayKeys(days, null)).toBe(days)
  })

  it('drops days before the cutoff', () => {
    const days = new Set(['2026-07-14', '2026-07-15', '2026-07-28'])
    expect([...windowDayKeys(days, '2026-07-15')].sort()).toEqual(['2026-07-15', '2026-07-28'])
  })

  it('handles an empty set', () => {
    expect(windowDayKeys(new Set(), '2026-07-15').size).toBe(0)
  })
})
