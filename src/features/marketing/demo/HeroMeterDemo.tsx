import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Badge, Card, CardContent } from '@/components/ui'
import { formatMinutes } from '@/lib/format'
import { DemoMeter } from './DemoMeter'
import { HERO_STEPS, demoSummary, heroTasksAt } from './landingDemo'
import { usePrefersReducedMotion } from './useReveal'

/** Milliseconds between two tasks dropping into the hero's day. */
const STEP_MS = 850

/** Reserve the full list height up front so the hero never shifts as rows land. */
const LIST_MIN_HEIGHT = HERO_STEPS.length * 36 + (HERO_STEPS.length - 1) * 8

/**
 * The hero's signature visual: a real capacity meter filling as a day's work
 * drops in, ending amber at 92% — "nearly full". Self-playing, replayable, and
 * eagerly bundled with the landing chunk so it is interactive immediately.
 *
 * Under reduced motion it renders the finished state at once and starts no
 * timers at all.
 */
export function HeroMeterDemo() {
  const reduced = usePrefersReducedMotion()
  const [step, setStep] = useState(HERO_STEPS.length)
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (reduced) {
      setStep(HERO_STEPS.length)
      return
    }
    setStep(0)
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setStep(i)
      if (i >= HERO_STEPS.length) window.clearInterval(id)
    }, STEP_MS)
    return () => window.clearInterval(id)
  }, [reduced, run])

  const tasks = heroTasksAt(step)
  const summary = demoSummary(tasks)
  const done = step >= HERO_STEPS.length

  return (
    <Card className="w-full max-w-md shadow-elevation-lg ring-1 ring-white/5">
      <CardContent className="space-y-5 p-5 sm:p-6">
        {/* `p`, not `h3`: the nearest heading above this in the hero is the
            page's h1, so a level-3 title here skips a level in the outline. */}
        <DemoMeter summary={summary} titleAs="p" showMessage={false} />

        <ul className="space-y-2" style={{ minHeight: LIST_MIN_HEIGHT }} aria-live="polite">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex h-9 animate-fade-in items-center gap-3 rounded-xl border border-white/5 bg-surface-2/50 px-3"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
              <span className="truncate text-sm text-text-primary">{task.title}</span>
              <span className="ml-auto shrink-0 font-mono text-xs text-text-muted">
                {formatMinutes(task.effort)}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3 border-t border-white/5 pt-4">
          {done ? (
            <Badge variant="outline" className="border-warning/30 text-warning">
              Nearly full
            </Badge>
          ) : (
            <span className="font-mono text-xs text-text-muted">planning…</span>
          )}
          <button
            type="button"
            onClick={() => setRun((n) => n + 1)}
            className="focus-ring tap-h-44 ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs text-text-muted transition-colors hover:text-text-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Replay
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
