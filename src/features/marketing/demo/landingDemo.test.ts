import { describe, it, expect } from 'vitest'
import { planDay } from '@/features/today/autoPlan'
import {
  DEMO_CAPACITY_MINUTES,
  HERO_STEPS,
  demoSummary,
  dropLargest,
  heroTasksAt,
  nextDemoTask,
  sumDemoEffort,
} from './landingDemo'
import { AUTOPLAN_BACKLOG, DEMO_ESTIMATE, DEMO_TODAY } from './autoPlanFixture'
import { DEMO_FOCUS_SECONDS, demoFocusProgress, formatDemoClock } from './focusTiming'

describe('landing demo — hero script', () => {
  it('drops in tasks one at a time', () => {
    expect(heroTasksAt(0)).toHaveLength(0)
    expect(heroTasksAt(3)).toHaveLength(3)
    expect(heroTasksAt(99)).toHaveLength(HERO_STEPS.length)
    expect(heroTasksAt(-2)).toHaveLength(0)
  })

  it('finishes at 92% — amber "nearly full", never over', () => {
    const full = demoSummary(heroTasksAt(HERO_STEPS.length))
    expect(full.plannedMinutes).toBe(330)
    expect(full.pct).toBe(92)
    expect(full.status).toBe('near')
  })

  it('walks empty → ok → near across the script', () => {
    expect(demoSummary(heroTasksAt(0)).status).toBe('empty')
    expect(demoSummary(heroTasksAt(1)).status).toBe('ok')
    expect(demoSummary(heroTasksAt(HERO_STEPS.length)).status).toBe('near')
  })
})

describe('landing demo — meter widget (W1)', () => {
  it('sums effort and reuses the real capacity math', () => {
    const list = [
      { id: 'a', title: 'A', effort: 60 },
      { id: 'b', title: 'B', effort: 30 },
    ]
    expect(sumDemoEffort(list)).toBe(90)
    expect(demoSummary(list).pct).toBe(25) // 90 / 360
  })

  it('turns amber at 80% and coral past 100%', () => {
    expect(demoSummary([{ id: 'a', title: 'A', effort: 288 }]).status).toBe('near') // exactly 80%
    expect(demoSummary([{ id: 'a', title: 'A', effort: 287 }]).status).toBe('ok')
    expect(demoSummary([{ id: 'a', title: 'A', effort: 361 }]).status).toBe('over')
  })

  it('clamps the bar at 100% while the percentage keeps climbing', () => {
    const over = demoSummary([{ id: 'a', title: 'A', effort: 720 }])
    expect(over.pct).toBe(200)
    expect(over.barPct).toBe(100)
    expect(over.overMinutes).toBe(360)
  })

  it('drops the biggest task to get back under capacity', () => {
    const list = [
      { id: 'a', title: 'A', effort: 30 },
      { id: 'b', title: 'B', effort: 120 },
      { id: 'c', title: 'C', effort: 60 },
    ]
    expect(dropLargest(list).map((t) => t.id)).toEqual(['a', 'c'])
  })

  it('resolves a size tie to the most recently added task', () => {
    const list = [
      { id: 'a', title: 'A', effort: 90 },
      { id: 'b', title: 'B', effort: 90 },
    ]
    expect(dropLargest(list).map((t) => t.id)).toEqual(['a'])
  })

  it('leaves an empty list alone', () => {
    expect(dropLargest([])).toEqual([])
  })

  it('rescues an overbooked demo day back under capacity', () => {
    const over = [
      { id: 'a', title: 'A', effort: 300 },
      { id: 'b', title: 'B', effort: 120 },
    ]
    expect(demoSummary(over).status).toBe('over')
    expect(demoSummary(dropLargest(over)).status).not.toBe('over')
  })

  it('cycles titles so repeated taps never render a duplicate id', () => {
    const list: ReturnType<typeof nextDemoTask>[] = []
    for (let i = 0; i < 10; i += 1) list.push(nextDemoTask(list, 30))
    expect(new Set(list.map((t) => t.id)).size).toBe(10)
    expect(list.every((t) => t.title.length > 0)).toBe(true)
  })
})

describe('landing demo — auto-plan widget (W2) runs the REAL planner', () => {
  const plan = planDay(
    [...AUTOPLAN_BACKLOG],
    DEMO_CAPACITY_MINUTES,
    DEMO_TODAY,
    DEMO_ESTIMATE,
  )

  it('is an overloaded backlog to begin with', () => {
    const total = AUTOPLAN_BACKLOG.reduce((s, t) => s + (t.effort_minutes ?? 0), 0)
    expect(total).toBe(600)
    expect(total).toBeGreaterThan(DEMO_CAPACITY_MINUTES)
  })

  it('fills the day to ~95% without ever exceeding capacity', () => {
    expect(plan.totalMinutes).toBe(345)
    expect(plan.totalMinutes).toBeLessThanOrEqual(DEMO_CAPACITY_MINUTES)
    const pct = Math.round((plan.totalMinutes / DEMO_CAPACITY_MINUTES) * 100)
    expect(pct).toBe(96)
    expect(pct).toBeGreaterThanOrEqual(90)
  })

  it('leaves the overflow in the backlog', () => {
    expect(plan.picks).toHaveLength(5)
    expect(plan.skipped).toBe(3)
    expect(plan.candidateCount).toBe(AUTOPLAN_BACKLOG.length)
  })

  it('picks by priority → due date → effort (the explainable order)', () => {
    expect(plan.picks.map((p) => p.task.id)).toEqual(['ap-1', 'ap-2', 'ap-3', 'ap-4', 'ap-6'])
  })

  it('never marks a demo pick as estimated (every row carries a real estimate)', () => {
    expect(plan.picks.every((p) => !p.estimated)).toBe(true)
  })
})

describe('landing demo — focus widget (W3)', () => {
  it('formats the timer face', () => {
    expect(formatDemoClock(25)).toBe('0:25')
    expect(formatDemoClock(5)).toBe('0:05')
    expect(formatDemoClock(0)).toBe('0:00')
    expect(formatDemoClock(-3)).toBe('0:00')
    expect(formatDemoClock(65)).toBe('1:05')
  })

  it('maps remaining seconds to a 0..1 ring progress', () => {
    expect(demoFocusProgress(DEMO_FOCUS_SECONDS)).toBe(0)
    expect(demoFocusProgress(0)).toBe(1)
    expect(demoFocusProgress(-5)).toBe(1)
    expect(demoFocusProgress(999)).toBe(0)
    expect(demoFocusProgress(DEMO_FOCUS_SECONDS / 2)).toBeCloseTo(0.5)
  })
})
