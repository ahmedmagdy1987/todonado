import { afterAll, describe, expect, it } from 'vitest'
import { isoDateOffset, todayISO } from '@/lib/date'
import { historyCutoffDay } from '@/features/history/historyWindow'
import { cleanDays, daysBetween, shiftDay } from '@/features/wellness/quit/quitMath'
import { computePlanningStreak } from './streak'
import { elapsedDays, lastDayOf } from '@/features/challenges/challenges'

/**
 * DAYLIGHT SAVING, in four real zones.
 *
 * `timezone.test.ts` already pins the local-vs-UTC midnight rule using two
 * fixed-offset zones. This file covers the harder half: zones that CHANGE
 * offset, where a "day" is 23 or 25 hours long.
 *
 * That distinction is the whole point. Every date helper in this app is built on
 * `Date.setDate(+n)` and `date-fns/format`, which step CALENDAR days — so they
 * survive a short or long day. Anything built on `+ 86_400_000` would not, and
 * would silently skip or repeat a day twice a year for a third of the world.
 * The app's derived counters (streak, quit day-zero, challenge windows, the
 * history cutoff) all sit on top of that, so each is exercised across a real
 * transition rather than assumed.
 *
 * ZONES, and why these four:
 *   Africa/Cairo      UTC+2/+3  — DST returned in 2023; the owner's own zone.
 *   Pacific/Auckland  UTC+12/+13 — the far side of the date line, southern DST.
 *   America/Santiago  UTC-4/-3  — southern hemisphere, transitions in the
 *                                 opposite direction to the north.
 *   America/New_York  UTC-5/-4  — the familiar case, kept as a control.
 *
 * 2026 transitions used below (verified against the IANA rules in force):
 *   Cairo      DST starts Fri 24 Apr, ends Thu 29 Oct
 *   Auckland   DST ends  Sun 5 Apr,  starts Sun 27 Sep
 *   Santiago   DST ends  Sun 5 Apr,  starts Sun 6 Sep
 *   New York   DST starts Sun 8 Mar, ends Sun 1 Nov
 */

const originalTZ = process.env.TZ
const setTZ = (tz: string) => {
  process.env.TZ = tz
}
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

/** Local noon on a given calendar day — safely inside any transition. */
const noon = (day: string) => new Date(`${day}T12:00:00`)

const ZONES = [
  { tz: 'Africa/Cairo', springForward: '2026-04-24', fallBack: '2026-10-29' },
  { tz: 'Pacific/Auckland', springForward: '2026-09-27', fallBack: '2026-04-05' },
  { tz: 'America/Santiago', springForward: '2026-09-06', fallBack: '2026-04-05' },
  { tz: 'America/New_York', springForward: '2026-03-08', fallBack: '2026-11-01' },
]

describe('a calendar day is a calendar day, even when it is 23 or 25 hours long', () => {
  for (const { tz, springForward, fallBack } of ZONES) {
    for (const [label, transition] of [
      ['spring forward', springForward],
      ['fall back', fallBack],
    ] as const) {
      it(`${tz}: stepping across ${label} moves exactly one day`, () => {
        setTZ(tz)
        const base = noon(transition)

        // Forward and back across the transition, one calendar day at a time.
        const before = isoDateOffset(-1, base)
        const after = isoDateOffset(1, base)
        expect(todayISO(base)).toBe(transition)
        expect(daysBetween(before, transition)).toBe(1)
        expect(daysBetween(transition, after)).toBe(1)

        // shiftDay is the quit tracker's own stepper and must agree.
        expect(shiftDay(transition, -1)).toBe(before)
        expect(shiftDay(transition, 1)).toBe(after)
      })
    }

    it(`${tz}: a 14-day history window spans 14 distinct days across a transition`, () => {
      setTZ(tz)
      const today = fallBack
      const cutoff = historyCutoffDay(14, today)
      expect(daysBetween(cutoff, today)).toBe(13)

      // Every day in the window is distinct — a repeated or skipped day would
      // mean an hour-based step somewhere in the chain.
      const seen = new Set<string>()
      let day = cutoff
      for (let i = 0; i < 14; i += 1) {
        seen.add(day)
        day = shiftDay(day, 1)
      }
      expect(seen.size).toBe(14)
    })

    it(`${tz}: a 7-day challenge window has 7 days across a transition`, () => {
      setTZ(tz)
      const start = shiftDay(springForward, -3)
      const end = lastDayOf(start, 7)
      expect(daysBetween(start, end)).toBe(6)
      expect(elapsedDays(start, 7, end)).toHaveLength(7)
      expect(new Set(elapsedDays(start, 7, end)).size).toBe(7)
    })

    it(`${tz}: a planning streak is not broken or double-counted by a transition`, () => {
      setTZ(tz)
      // Five consecutive planned days ending on the transition day.
      const days = new Set<string>()
      let day = shiftDay(fallBack, -4)
      for (let i = 0; i < 5; i += 1) {
        days.add(day)
        day = shiftDay(day, 1)
      }
      expect(computePlanningStreak(days, fallBack)).toEqual({ count: 5, includesToday: true })
    })

    it(`${tz}: quit day-zero counts whole local days across a transition`, () => {
      setTZ(tz)
      // Quit at local 08:00 three days before the transition; "now" is local
      // 08:00 three days after it. Six calendar days have passed, and a
      // 24-hour-based count would be out by one on one side.
      const start = new Date(`${shiftDay(fallBack, -3)}T08:00:00`)
      const now = new Date(`${shiftDay(fallBack, 3)}T08:00:00`)
      expect(cleanDays(start.toISOString(), now)).toBe(6)
    })
  }
})

describe('the local day near midnight, in a DST zone', () => {
  it('Africa/Cairo: 23:59 and 00:01 are different days', () => {
    setTZ('Africa/Cairo')
    const lateNight = new Date('2026-07-31T23:59:00')
    const justAfter = new Date('2026-08-01T00:01:00')
    expect(todayISO(lateNight)).toBe('2026-07-31')
    expect(todayISO(justAfter)).toBe('2026-08-01')
  })

  it('Pacific/Auckland: the same UTC instant is a different local day than in Cairo', () => {
    // 2026-07-31T22:00Z is 2026-08-01 01:00 in Cairo (+3) and 2026-08-01 10:00
    // in Auckland (+12) — both the 1st. Twelve hours earlier they diverge.
    const instant = new Date('2026-07-31T13:00:00Z')
    setTZ('Africa/Cairo')
    const cairo = todayISO(instant)
    setTZ('Pacific/Auckland')
    const auckland = todayISO(instant)
    expect(cairo).toBe('2026-07-31')
    expect(auckland).toBe('2026-08-01')
    expect(cairo).not.toBe(auckland)
  })
})
