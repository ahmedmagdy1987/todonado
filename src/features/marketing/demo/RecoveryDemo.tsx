import { useState } from 'react'
import { Check, RotateCcw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { computeCapacity, sumEffort } from '@/features/today/capacity'
import { rolloverSpan, selectRolloverTasks } from '@/features/today/rollover'
import { DEMO_CAPACITY_MINUTES } from './landingDemo'
import { DemoMeter } from './DemoMeter'
import {
  RECOVERY_TODAY,
  RECOVERY_TODAY_TASKS,
  RECOVERY_YESTERDAY_TASKS,
} from './recoveryFixture'

/**
 * Recovery, run by the product's own selection logic.
 *
 * `selectRolloverTasks` and `rolloverSpan` are the SAME functions the signed-in
 * Today screen calls, and `computeCapacity` is the same meter. Nothing here is
 * a drawing of the feature. The widget hands the real functions a fixed day and
 * shows what they return.
 *
 * ── WHY THIS SECTION EXISTS AT ALL ─────────────────────────────────────────
 *
 * Recovery is documented as a founding principle of the product and appeared
 * NOWHERE on the public page. That left the story ending at "plan a day that
 * fits", which quietly implies the plan always holds. It never does, and a
 * visitor knows it. Naming the bad day before they think of it is what makes
 * the rest of the page credible rather than aspirational.
 *
 * ── THE UNDO IS PART OF THE ARGUMENT ───────────────────────────────────────
 *
 * The real feature is undoable, so the demo is too. A carry-over that cannot be
 * taken back is a system making decisions for you, which is the opposite of
 * what this section claims.
 */
export function RecoveryDemo() {
  const [movedAt, setMovedAt] = useState<number | null>(null)
  const moved = movedAt !== null

  // The REAL selection: open tasks whose scheduled day is before today.
  const leftovers = selectRolloverTasks([...RECOVERY_YESTERDAY_TASKS], RECOVERY_TODAY)
  const span = rolloverSpan([...leftovers], RECOVERY_TODAY)

  const todayTasks = moved ? [...RECOVERY_TODAY_TASKS, ...leftovers] : [...RECOVERY_TODAY_TASKS]
  const summary = computeCapacity(sumEffort(todayTasks), DEMO_CAPACITY_MINUTES)
  const carried = sumEffort([...leftovers])

  const done = RECOVERY_YESTERDAY_TASKS.filter((t) => t.status === 'done')

  return (
    <div className="rounded-3xl border border-white/5 bg-surface/60 p-5 shadow-elevation sm:p-6">
      {/* ── Yesterday ───────────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-sm font-semibold sm:text-base">Yesterday</h3>
        <p className="font-mono text-xs tabular-nums text-text-muted">
          {done.length} of {RECOVERY_YESTERDAY_TASKS.length} done
        </p>
      </div>

      <ul className="mt-3 space-y-1.5">
        {RECOVERY_YESTERDAY_TASKS.map((task) => {
          const isDone = task.status === 'done'
          const isMoving = !isDone && moved
          return (
            <li
              key={task.id}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-500',
                isDone && 'text-text-muted',
                !isDone && !moved && 'bg-warning/10 text-text-primary',
                isMoving && 'opacity-40',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  isDone ? 'border-success bg-success/20 text-success' : 'border-white/25',
                )}
              >
                {isDone && <Check className="h-3 w-3" />}
              </span>
              <span className={cn('min-w-0 flex-1 truncate', isDone && 'line-through')}>
                {task.title}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
                {formatMinutes(task.effort_minutes ?? 0)}
              </span>
            </li>
          )
        })}
      </ul>

      {/* ── The carry-over ──────────────────────────────────────────────── */}
      <div className="mt-5 rounded-2xl border border-white/5 bg-background/40 p-4">
        {moved ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-primary">
              Moved {leftovers.length} tasks to today.{' '}
              <span className="text-text-muted">Nothing was lost.</span>
            </p>
            <Button size="sm" variant="ghost" onClick={() => setMovedAt(null)}>
              <Undo2 className="h-4 w-4" aria-hidden />
              Undo
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted">
              {/* `rolloverSpan` decides this word, so a two-day-old task can
                  never be mislabelled "yesterday". */}
              {leftovers.length} tasks did not get done{' '}
              {span === 'yesterday' ? 'yesterday' : 'earlier this week'}.
            </p>
            <Button size="sm" onClick={() => setMovedAt(Date.now())}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Move to today
            </Button>
          </div>
        )}
      </div>

      {/* ── Today, recomputed ───────────────────────────────────────────── */}
      <div className="mt-5 border-t border-white/5 pt-5">
        <DemoMeter
          summary={summary}
          title="Today"
          showMessage={false}
          className="[&_h3]:text-sm"
        />
        <p className="mt-3 text-xs leading-relaxed text-text-muted" aria-live="polite">
          {moved
            ? `The ${formatMinutes(carried)} you carried over is counted, so today still tells you the truth.`
            : 'Carry them over and the meter recounts, so today stays honest.'}
        </p>
      </div>
    </div>
  )
}
