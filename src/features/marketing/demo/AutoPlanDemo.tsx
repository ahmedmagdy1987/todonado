import { useEffect, useMemo, useState } from 'react'
import { Moon, RotateCcw, Sparkles } from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { computeCapacity } from '@/features/today/capacity'
import { planDay } from '@/features/today/autoPlan'
import { PRIORITY_META } from '@/features/tasks/priority'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DemoMeter } from './DemoMeter'
import { DEMO_CAPACITY_MINUTES } from './landingDemo'
import { AUTOPLAN_BACKLOG, DEMO_ESTIMATE, DEMO_TODAY } from './autoPlanFixture'
import { usePrefersReducedMotion } from './useReveal'

/** Milliseconds between two picks landing on the day. */
const REVEAL_MS = 320

/**
 * W2 — "Auto-plan". A messy ten-hour backlog against a six-hour day. One press
 * runs the product's REAL `planDay` (priority → due date → effort, greedy,
 * never over capacity) and the chosen tasks land one by one while everything
 * that didn't fit dims out. Deterministic, in-memory, no AI.
 */
export function AutoPlanDemo() {
  // The plan is pure and deterministic — compute it once.
  const plan = useMemo(
    () => planDay([...AUTOPLAN_BACKLOG], DEMO_CAPACITY_MINUTES, DEMO_TODAY, DEMO_ESTIMATE),
    [],
  )
  const pickOrder = useMemo(() => plan.picks.map((p) => p.task.id), [plan])
  const backlogMinutes = useMemo(
    () => AUTOPLAN_BACKLOG.reduce((total, t) => total + (t.effort_minutes ?? 0), 0),
    [],
  )

  const reduced = usePrefersReducedMotion()
  const [running, setRunning] = useState(false)
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    if (!running || revealed >= plan.picks.length) return
    // Reduced motion: land the whole plan at once rather than staggering it in.
    if (reduced) {
      setRevealed(plan.picks.length)
      return
    }
    const id = window.setTimeout(() => setRevealed((n) => n + 1), REVEAL_MS)
    return () => window.clearTimeout(id)
  }, [running, revealed, plan.picks.length, reduced])

  const settled = running && revealed >= plan.picks.length
  const plannedMinutes = plan.picks
    .slice(0, revealed)
    .reduce((total, pick) => total + pick.cost, 0)
  const summary = computeCapacity(plannedMinutes, DEMO_CAPACITY_MINUTES)

  /** Position in the reveal order, or -1 when this task never got picked. */
  const pickIndex = (id: string) => pickOrder.indexOf(id)

  function reset() {
    setRunning(false)
    setRevealed(0)
  }

  return (
    <Card className="w-full ring-1 ring-white/5">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <DemoMeter summary={summary} title="Today" showMessage={false} />

        <div className="flex flex-wrap items-center gap-3 border-y border-white/5 py-4">
          <Button size="md" onClick={() => setRunning(true)} disabled={running}>
            <Sparkles className="h-4 w-4" aria-hidden />
            Plan my day
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
              ? `${plan.picks.length} planned · ${plan.skipped} left for later`
              : `${AUTOPLAN_BACKLOG.length} tasks · ${formatMinutes(backlogMinutes)} of work`}
          </p>
        </div>

        <ul className="space-y-2">
          {AUTOPLAN_BACKLOG.map((task) => {
            const idx = pickIndex(task.id)
            const picked = idx >= 0 && idx < revealed
            const rejected = settled && idx < 0
            const meta = PRIORITY_META[task.priority]

            return (
              <li
                key={task.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-300',
                  picked
                    ? 'border-brand/40 bg-brand-gradient-soft'
                    : 'border-white/5 bg-surface-2/40',
                  rejected && 'opacity-40',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    meta.dot || 'bg-text-muted/40',
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    'truncate text-sm',
                    picked ? 'text-text-primary' : 'text-text-muted',
                  )}
                >
                  {task.title}
                </span>

                {picked && (
                  <Badge variant="brand" className="ml-auto shrink-0">
                    Today
                  </Badge>
                )}
                {rejected && (
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-text-muted">
                    <Moon className="h-3 w-3" aria-hidden />
                    Tomorrow
                  </span>
                )}

                <span
                  className={cn(
                    'shrink-0 font-mono text-xs tabular-nums',
                    picked ? 'text-text-primary' : 'text-text-muted',
                    !picked && !rejected && 'ml-auto',
                  )}
                >
                  {formatMinutes(task.effort_minutes ?? 0)}
                </span>
              </li>
            )
          })}
        </ul>

        {settled && (
          <p className="animate-fade-in text-xs leading-relaxed text-text-muted">
            Picked by priority, then due date, then how long each one takes, and stopped at{' '}
            <span className="font-mono text-text-primary">
              {formatMinutes(plan.totalMinutes)}
            </span>{' '}
            because the next task wouldn&rsquo;t fit. The planner never overcommits your day.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
