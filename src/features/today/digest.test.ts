import { describe, expect, it } from 'vitest'
import { makeTask } from '@/test/factories'
import type { EstimationBias } from '@/features/insights/insights'
import type { DayPlan, PlanPick } from './autoPlan'
import {
  MAX_ALERTS,
  WELCOME_MAX_AGE_DAYS,
  composeDigest,
  isDigestDismissed,
  selectPriorityAlerts,
  type DigestInput,
} from './digest'

const TODAY = '2026-06-23'
const YESTERDAY = '2026-06-22'
const TOMORROW = '2026-06-24'

const bias = (over: Partial<EstimationBias> = {}): EstimationBias => ({
  sampleCount: 0,
  minSamples: 5,
  hasEnough: false,
  medianRatio: null,
  biasPct: null,
  direction: null,
  samples: [],
  ...over,
})

const pick = (id: string, cost: number): PlanPick => ({
  task: makeTask({ id }),
  cost,
  estimated: false,
})

const dayPlan = (over: Partial<DayPlan> = {}): DayPlan => ({
  picks: [pick('p1', 60), pick('p2', 90)],
  totalMinutes: 150,
  remainingCapacity: 240,
  capacityFull: false,
  candidateCount: 5,
  skipped: 3,
  scope: 'all',
  excludedByScope: 0,
  alreadyPlanned: 0,
  ...over,
})

/**
 * The three entitlement states, named once.
 *
 * `RESOLVING` is the one worth having a name for: it is neither tier, it is the
 * window before the billing row arrives, and it used to be silently rendered as
 * Pro on the app's default screen.
 */
const FREE = { status: 'resolved', plan: 'free' } as const
const PRO = { status: 'resolved', plan: 'pro' } as const
const RESOLVING = { status: 'resolving', plan: 'free' } as const

const input = (over: Partial<DigestInput> = {}): DigestInput => ({
  todayStr: TODAY,
  entitlement: FREE,
  accountAgeDays: 30,
  streak: { count: 4, includesToday: true },
  rolloverTasks: [],
  hasCalendarSource: false,
  busyMinutes: 0,
  freeMinutes: 240,
  capacityStatus: 'ok',
  plan: dayPlan(),
  bias: bias(),
  tasks: [],
  ...over,
})

describe('isDigestDismissed — scoped to the local day', () => {
  it('hides only for the day it was dismissed on', () => {
    expect(isDigestDismissed(TODAY, TODAY)).toBe(true)
  })

  it('comes back tomorrow on its own', () => {
    expect(isDigestDismissed(YESTERDAY, TODAY)).toBe(false)
  })

  it('shows when never dismissed', () => {
    expect(isDigestDismissed(null, TODAY)).toBe(false)
  })
})

describe('composeDigest — variant', () => {
  it.each([0, WELCOME_MAX_AGE_DAYS])('uses the welcome variant on day-age %i', (age) => {
    expect(composeDigest(input({ accountAgeDays: age })).variant).toBe('welcome')
  })

  it('switches to the standard variant once the account is older', () => {
    expect(composeDigest(input({ accountAgeDays: WELCOME_MAX_AGE_DAYS + 1 })).variant).toBe(
      'standard',
    )
  })

  it('never forces welcome when the age is unknown', () => {
    expect(composeDigest(input({ accountAgeDays: null })).variant).toBe('standard')
  })
})

describe('composeDigest — the FREE base is useful on its own', () => {
  it('carries the streak straight through', () => {
    const d = composeDigest(input({ streak: { count: 7, includesToday: false } }))
    expect(d.streakCount).toBe(7)
    expect(d.streakIncludesToday).toBe(false)
  })

  it('reports a zero streak as 0 rather than inventing one', () => {
    expect(composeDigest(input({ streak: { count: 0, includesToday: false } })).streakCount).toBe(0)
  })

  it('summarises carried-over work', () => {
    const d = composeDigest(
      input({
        rolloverTasks: [
          makeTask({ effort_minutes: 30, scheduled_for: YESTERDAY }),
          makeTask({ effort_minutes: 45, scheduled_for: YESTERDAY }),
          makeTask({ effort_minutes: null, scheduled_for: YESTERDAY }),
        ],
      }),
    )
    expect(d.rollover).toEqual({ count: 3, minutes: 75, span: 'yesterday' })
  })

  it('says "earlier days" when the leftovers predate yesterday — never mislabels them', () => {
    const d = composeDigest(
      input({
        rolloverTasks: [
          makeTask({ effort_minutes: 30, scheduled_for: YESTERDAY }),
          makeTask({ effort_minutes: 30, scheduled_for: '2026-06-18' }),
        ],
      }),
    )
    expect(d.rollover?.span).toBe('earlier')
  })

  it('omits the roll-over row when nothing carried over', () => {
    expect(composeDigest(input({ rolloverTasks: [] })).rollover).toBeNull()
  })

  it('omits meetings when there is no calendar source at all', () => {
    expect(composeDigest(input({ hasCalendarSource: false, busyMinutes: 120 })).meetings).toBeNull()
  })

  it('omits meetings when the calendar is connected but today is clear', () => {
    expect(composeDigest(input({ hasCalendarSource: true, busyMinutes: 0 })).meetings).toBeNull()
  })

  it('shows meetings when there are any', () => {
    expect(composeDigest(input({ hasCalendarSource: true, busyMinutes: 90 })).meetings).toEqual({
      minutes: 90,
    })
  })

  it('passes the capacity headline through, never negative', () => {
    expect(composeDigest(input({ freeMinutes: 135 })).freeMinutes).toBe(135)
    expect(composeDigest(input({ freeMinutes: -20 })).freeMinutes).toBe(0)
  })

  it('gets NO Pro rows, but does get the quiet teaser when a plan exists', () => {
    const d = composeDigest(
      input({ entitlement: FREE, bias: bias({ hasEnough: true, biasPct: 20, direction: 'under' }) }),
    )
    expect(d.suggestion).toBeNull()
    expect(d.bias).toBeNull()
    expect(d.proTeaser).toBe(true)
  })

  it('DOES get priority alerts, which are no longer paid', () => {
    /*
     * Alerts used to be Pro. A packaging audit could not defend it: an alert is
     * "this high-priority task is overdue", computed in the browser from tasks
     * the user already holds. It was one of the weakest lines in the paid tier,
     * and this test is what stops it drifting back.
     */
    const withAlerts = composeDigest(input({ entitlement: FREE }))
    const paid = composeDigest(input({ entitlement: PRO }))
    expect(withAlerts.alerts).toEqual(paid.alerts)
  })

  it('shows no teaser when there is nothing to suggest anyway', () => {
    expect(composeDigest(input({ entitlement: FREE, plan: dayPlan({ picks: [] }) })).proTeaser).toBe(
      false,
    )
    expect(composeDigest(input({ entitlement: FREE, plan: null })).proTeaser).toBe(false)
  })
})

describe('composeDigest while the plan is still resolving', () => {
  /*
   * THE STATE THAT USED TO LEAK. Today passed `isPro || billingLoading`, so for
   * the length of every cold load on the app's DEFAULT SCREEN a Free user was
   * served the pre-computed plan and the estimation nudge. The optimistic read
   * was there for a real reason (a subscriber should not be pitched the plan
   * they already pay for), so the fix has to satisfy both, and these two tests
   * are the two halves of that.
   */
  const resolving = composeDigest(
    input({
      entitlement: RESOLVING,
      bias: bias({ hasEnough: true, biasPct: 20, direction: 'under' }),
    }),
  )

  it('withholds every paid row until the plan is actually known', () => {
    expect(resolving.suggestion).toBeNull()
    expect(resolving.bias).toBeNull()
  })

  it('also withholds the upsell, so nobody is pitched a plan they may own', () => {
    expect(resolving.proTeaser).toBe(false)
  })

  it('still renders the free briefing, so the card is never empty', () => {
    expect(resolving.streakCount).toBe(4)
    expect(resolving.freeMinutes).toBe(240)
    expect(resolving.alerts).toEqual(composeDigest(input({ entitlement: FREE })).alerts)
  })
})

describe('composeDigest — the PRO smart layer', () => {
  const pro = (over: Partial<DigestInput> = {}) =>
    composeDigest(input({ entitlement: PRO, ...over }))

  it('pre-computes a ready-made plan to accept', () => {
    expect(pro().suggestion).toEqual({
      picks: expect.any(Array),
      taskCount: 2,
      totalMinutes: 150,
    })
  })

  it('offers nothing when the day is already at capacity', () => {
    const d = pro({ plan: dayPlan({ capacityFull: true, picks: [], totalMinutes: 0 }) })
    expect(d.suggestion).toBeNull()
    expect(d.dayAlreadyPlanned).toBe(true)
    expect(d.proTeaser).toBe(false)
  })

  it('offers nothing when there is nothing left that fits', () => {
    expect(pro({ plan: dayPlan({ picks: [], totalMinutes: 0 }) }).suggestion).toBeNull()
  })

  it('offers nothing when auto-plan is switched off', () => {
    const d = pro({ plan: null })
    expect(d.suggestion).toBeNull()
    expect(d.dayAlreadyPlanned).toBe(false)
  })

  it.each([
    ['under', 20, 20],
    ['over', -25, 25],
  ] as const)('surfaces a %s-estimation nudge as an absolute percentage', (direction, pct, shown) => {
    const d = pro({ bias: bias({ hasEnough: true, biasPct: pct, direction }) })
    expect(d.bias).toEqual({ direction, pct: shown })
  })

  it('stays quiet below the sample threshold', () => {
    expect(pro({ bias: bias({ hasEnough: false, biasPct: 40, direction: 'under' }) }).bias).toBeNull()
  })

  it('stays quiet when estimates are already accurate', () => {
    expect(pro({ bias: bias({ hasEnough: true, biasPct: 2, direction: 'accurate' }) }).bias).toBeNull()
  })

  it('still warns a day-one account about an imminent deadline', () => {
    // Alerts are about what's COMING, so the welcome variant must not hide them —
    // that would be exactly the empty shell the welcome variant exists to avoid.
    const d = pro({
      accountAgeDays: 0,
      tasks: [makeTask({ id: 'due', due_date: TOMORROW })],
    })
    expect(d.variant).toBe('welcome')
    expect(d.alerts).toHaveLength(1)
    expect(d.suggestion).not.toBeNull()
  })

  it('keeps the bias nudge tied to sample count, not to account age', () => {
    // A new account has no samples, so hasEnough is false and this stays quiet
    // on its own — no separate age rule needed.
    expect(pro({ accountAgeDays: 0, bias: bias({ hasEnough: false }) }).bias).toBeNull()
    expect(
      pro({ accountAgeDays: 0, bias: bias({ hasEnough: true, biasPct: 30, direction: 'under' }) })
        .bias,
    ).toEqual({ direction: 'under', pct: 30 })
  })

  it('surfaces priority alerts', () => {
    const d = pro({ tasks: [makeTask({ id: 'a', priority: 3, scheduled_for: YESTERDAY })] })
    expect(d.alerts).toHaveLength(1)
    expect(d.alerts[0].kind).toBe('overdue')
  })
})

describe('selectPriorityAlerts', () => {
  it('flags overdue HIGH-priority work (late schedule or late deadline)', () => {
    const bySchedule = makeTask({ id: 'a', priority: 3, scheduled_for: YESTERDAY })
    const byDue = makeTask({ id: 'b', priority: 3, due_date: YESTERDAY })
    const alerts = selectPriorityAlerts([bySchedule, byDue], TODAY)
    expect(alerts.map((a) => a.task.id).sort()).toEqual(['a', 'b'])
    expect(alerts.every((a) => a.kind === 'overdue')).toBe(true)
  })

  it('does NOT raise an overdue alert for lower-priority late work', () => {
    const alerts = selectPriorityAlerts(
      [makeTask({ id: 'a', priority: 2, scheduled_for: YESTERDAY })],
      TODAY,
    )
    expect(alerts).toEqual([])
  })

  it('flags deadlines inside 48h — today and tomorrow', () => {
    const alerts = selectPriorityAlerts(
      [makeTask({ id: 'a', due_date: TODAY }), makeTask({ id: 'b', due_date: TOMORROW })],
      TODAY,
    )
    expect(alerts.map((a) => a.kind)).toEqual(['due_soon', 'due_soon'])
  })

  it('ignores deadlines beyond 48h', () => {
    expect(selectPriorityAlerts([makeTask({ due_date: '2026-06-26' })], TODAY)).toEqual([])
  })

  it('ignores finished and cancelled work', () => {
    const tasks = [
      makeTask({ status: 'done', priority: 3, scheduled_for: YESTERDAY }),
      makeTask({ status: 'cancelled', due_date: TODAY }),
    ]
    expect(selectPriorityAlerts(tasks, TODAY)).toEqual([])
  })

  it('never lists the same task twice, and prefers "overdue" over "due soon"', () => {
    // High priority, scheduled in the past AND due tomorrow.
    const t = makeTask({ id: 'a', priority: 3, scheduled_for: YESTERDAY, due_date: TOMORROW })
    const alerts = selectPriorityAlerts([t], TODAY)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].kind).toBe('overdue')
  })

  it('puts overdue first, then the soonest deadline', () => {
    const tasks = [
      makeTask({ id: 'soon', due_date: TOMORROW }),
      makeTask({ id: 'today', due_date: TODAY }),
      makeTask({ id: 'late', priority: 3, due_date: YESTERDAY }),
    ]
    expect(selectPriorityAlerts(tasks, TODAY).map((a) => a.task.id)).toEqual([
      'late',
      'today',
      'soon',
    ])
  })

  it('caps the list so the card informs instead of nagging', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({ id: `t${i}`, priority: 3, scheduled_for: YESTERDAY }),
    )
    expect(selectPriorityAlerts(tasks, TODAY)).toHaveLength(MAX_ALERTS)
  })

  it('handles an empty task list', () => {
    expect(selectPriorityAlerts([], TODAY)).toEqual([])
  })
})
