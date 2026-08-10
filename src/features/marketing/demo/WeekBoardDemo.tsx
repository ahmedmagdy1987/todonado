import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, RotateCcw, Sparkles } from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { computeCapacity, type CapacityStatus } from '@/features/today/capacity'
import { planWeek } from '@/features/week/planWeek'
import { WEEK_LENGTH, dayOfMonth, weekDates, weekdayLabel } from '@/features/week/week'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DEMO_CAPACITY_MINUTES } from './landingDemo'
import { DEMO_ESTIMATE, DEMO_TODAY } from './autoPlanFixture'
import { WEEK_BACKLOG, WEEK_EXISTING, WEEK_TASKS } from './weekFixture'
import { usePrefersReducedMotion } from './useReveal'

/** Milliseconds between two days filling in. */
const REVEAL_MS = 260

/** Identical fill semantics to the product's own CapacityMeter and DemoMeter. */
const FILL: Record<CapacityStatus, string> = {
  empty: 'bg-surface-2',
  ok: 'bg-brand-gradient',
  near: 'bg-warning',
  over: 'bg-danger',
}

/**
 * W4 — "Plan my week". Seven day-columns, three of them already carrying real
 * work, and a backlog that does not fit. One press runs the product's REAL
 * `planWeek` — the same function the Pro week board uses — and the plan lands
 * day by day, never pushing a single column over its capacity.
 *
 * It exists because week planning is the flagship paid feature and, until now,
 * was completely invisible to anyone who had not signed up.
 *
 * Deterministic, in-memory, ZERO database calls: the fixture is a static array
 * and `planWeek` is pure. Nothing here imports dnd-kit — the real board's drag
 * layer stays out of the landing entirely.
 */
export function WeekBoardDemo() {
  const dates = useMemo(() => weekDates(DEMO_TODAY, WEEK_LENGTH), [])

  /** Minutes already committed on each day BEFORE the planner runs. */
  const existingByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of WEEK_EXISTING) {
      if (!t.scheduled_for) continue
      map.set(t.scheduled_for, (map.get(t.scheduled_for) ?? 0) + (t.effort_minutes ?? 0))
    }
    return map
  }, [])

  // Pure and deterministic — compute the plan once.
  const plan = useMemo(
    () =>
      planWeek({
        tasks: [...WEEK_TASKS],
        capacityMinutes: DEMO_CAPACITY_MINUTES,
        todayStr: DEMO_TODAY,
        estimate: DEMO_ESTIMATE,
      }),
    [],
  )

  const addedByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of plan.days) map.set(d.date, d.addedMinutes)
    return map
  }, [plan])

  const reduced = usePrefersReducedMotion()
  const [running, setRunning] = useState(false)
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    if (!running || revealed >= dates.length) return
    // Reduced motion: land the whole week at once rather than staggering it.
    if (reduced) {
      setRevealed(dates.length)
      return
    }
    const id = window.setTimeout(() => setRevealed((n) => n + 1), REVEAL_MS)
    return () => window.clearTimeout(id)
  }, [running, revealed, dates.length, reduced])

  const settled = running && revealed >= dates.length
  const backlogMinutes = WEEK_BACKLOG.reduce((n, t) => n + (t.effort_minutes ?? 0), 0)

  function reset() {
    setRunning(false)
    setRevealed(0)
  }

  return (
    <Card className="w-full ring-1 ring-white/5">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-brand" aria-hidden />
          <h3 className="font-display text-base font-semibold">Your week</h3>
          <Badge variant="outline" className="ml-auto">
            Pro
          </Badge>
        </div>

        {/* Seven columns. Each bar is that day's own capacity — the promise is
            per-day, so one shared meter would misrepresent it. */}
        <ul className="flex items-end gap-1.5 sm:gap-2">
          {dates.map((date, i) => {
            const before = existingByDate.get(date) ?? 0
            const added = i < revealed ? (addedByDate.get(date) ?? 0) : 0
            const summary = computeCapacity(before + added, DEMO_CAPACITY_MINUTES)
            const beforePct = Math.min(100, (before / DEMO_CAPACITY_MINUTES) * 100)

            return (
              <li key={date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="font-mono text-[10px] tabular-nums text-text-muted">
                  {summary.pct}%
                </span>
                <div
                  className="relative flex h-28 w-full items-end overflow-hidden rounded-lg bg-surface-2/50 sm:h-36"
                  role="img"
                  aria-label={`${weekdayLabel(date)}: ${summary.pct}% of the day planned`}
                >
                  {/* Work already on the day, under the new plan. */}
                  <div
                    className="absolute inset-x-0 bottom-0 bg-surface-2"
                    style={{ height: `${beforePct}%` }}
                    aria-hidden
                  />
                  <div
                    className={cn(
                      'relative w-full transition-[height] duration-500 ease-out',
                      FILL[summary.status],
                    )}
                    style={{ height: `${summary.barPct}%` }}
                    aria-hidden
                  />
                </div>
                <span className="text-[10px] font-medium text-text-muted">
                  {weekdayLabel(date)}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-text-muted/70">
                  {dayOfMonth(date)}
                </span>
              </li>
            )
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-4">
          <Button size="md" onClick={() => setRunning(true)} disabled={running}>
            <Sparkles className="h-4 w-4" aria-hidden />
            Plan my week
          </Button>
          <button
            type="button"
            onClick={reset}
            disabled={!running}
            className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Reset
          </button>
          <p className="ml-auto font-mono text-xs text-text-muted" aria-live="polite">
            {settled
              ? `${plan.taskCount} planned · ${plan.skipped} left for later`
              : `${WEEK_BACKLOG.length} tasks · ${formatMinutes(backlogMinutes)} to schedule`}
          </p>
        </div>

        {settled && (
          <p className="animate-fade-in text-xs leading-relaxed text-text-muted">
            Each task went to the <span className="text-text-primary">earliest day with room</span>,
            packed around the work already there, and never after its own due date. Nothing was
            forced onto a full day; {plan.skipped === 0 ? 'everything fit' : 'what didn’t fit is still waiting'}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
