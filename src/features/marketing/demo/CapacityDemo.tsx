import { useRef, useState } from 'react'
import { RotateCcw, Sunrise, X } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'
import { formatMinutes } from '@/lib/format'
import { DemoMeter } from './DemoMeter'
import {
  DEMO_EFFORT_CHIPS,
  type DemoTask,
  demoSummary,
  dropLargest,
  nextDemoTask,
} from './landingDemo'

/**
 * W1 — "Feel the meter". A miniature Today: tap an effort chip, watch the real
 * capacity math fill the meter, turn amber at 80%, and go coral when the day
 * stops fitting. Entirely in-memory — no auth, no database, no analytics.
 */
export function CapacityDemo() {
  const [tasks, setTasks] = useState<DemoTask[]>([])
  // Monotonic counter so ids stay unique even after removals. A ref (not state)
  // because two taps in the same batch must not read the same value.
  const seq = useRef(0)

  const summary = demoSummary(tasks)
  const over = summary.status === 'over'

  function add(minutes: number) {
    const n = seq.current
    seq.current += 1
    setTasks((list) => [...list, nextDemoTask(list, minutes, n)])
  }

  function remove(id: string) {
    setTasks((list) => list.filter((t) => t.id !== id))
  }

  return (
    <Card className="w-full ring-1 ring-white/5">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <DemoMeter summary={summary} />

        {/* Chips — the one-tap effort presets from the real quick-add. */}
        <div>
          <p id="demo-chip-label" className="mb-2 text-xs font-medium text-text-muted">
            Add a task
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="demo-chip-label">
            {DEMO_EFFORT_CHIPS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => add(minutes)}
                aria-label={`Add a ${formatMinutes(minutes)} task to the demo day`}
                className="focus-ring inline-flex h-11 min-w-[4.5rem] items-center justify-center rounded-xl border border-white/10 bg-surface-2/60 px-4 font-mono text-sm text-text-primary transition-all hover:border-brand/40 hover:bg-surface-2 active:scale-95"
              >
                +{formatMinutes(minutes)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTasks([])}
              disabled={tasks.length === 0}
              aria-label="Reset the demo day"
              className="focus-ring inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reset
            </button>
          </div>
        </div>

        {/* The overbooked moment — the whole point of the product. */}
        {over && (
          <div className="animate-fade-in rounded-2xl border border-danger/30 bg-danger/10 p-4">
            <p className="text-sm font-medium text-danger">
              {formatMinutes(summary.overMinutes)} more than the day holds.
            </p>
            <p className="mt-1 text-xs text-text-muted">
              A to-do list would let you find this out at 6pm. Todonado tells you now, while there is
              still time to change it.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => setTasks(dropLargest)}
            >
              <Sunrise className="h-4 w-4" aria-hidden />
              Move the biggest task to tomorrow
            </Button>
          </div>
        )}

        {/* The day itself. */}
        {tasks.length > 0 ? (
          <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex animate-fade-in items-center gap-3 rounded-xl border border-white/5 bg-surface-2/50 py-2 pl-3 pr-2"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                <span className="truncate text-sm text-text-primary">{task.title}</span>
                <span className="ml-auto shrink-0 font-mono text-xs text-text-muted">
                  {formatMinutes(task.effort)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(task.id)}
                  aria-label={`Remove ${task.title} from the demo day`}
                  className="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-text-muted">
            {/* "Tap a chip above to start filling the day." named a UI
                component nobody outside the codebase calls a chip, and asked
                the reader to picture "filling a day". The buttons are lengths;
                say so. */}
            Tap a time above to add your first task.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
