import { Timer } from 'lucide-react'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DemoMeter } from '../demo/DemoMeter'
import { DEMO_CAPACITY_MINUTES, HERO_STEPS, demoSummary } from '../demo/landingDemo'

/**
 * ONE AUTHENTIC PRODUCT COMPOSITION, AND NOTHING TO PRESS.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * The hero used to be a self-playing widget: a meter that filled itself over
 * four seconds and could be replayed. It demonstrated the product well to
 * anyone who waited, and it explained nothing to the larger number of people
 * who scroll within two seconds, because at the moment of first paint the
 * screen showed an empty meter and a list with no rows in it.
 *
 * A landing page's first visual has one job: prove there is a real product and
 * show what using it looks like. A finished state does that instantly. Motion
 * is a bonus that the visitor may never see, so it cannot be load-bearing.
 *
 * ── IT IS A COMPOSITION, NOT THREE WIDGETS STACKED ─────────────────────────
 *
 * One frame carries the whole loop in a single glance: the day with a real
 * capacity meter on it, the work that is planned into it with time on each
 * item, the task currently being worked in Focus, and the week the day sits in.
 * Those are four separate screens in the product, and showing them as four
 * separate cards is what made the old page feel like a features list rather
 * than a system.
 *
 * ── THE NUMBERS ARE REAL ───────────────────────────────────────────────────
 *
 * The meter runs the product's own `computeCapacity` over the same fixture the
 * old hero used: five ordinary tasks totalling 330 minutes against a 360 minute
 * day, which lands at 92% and amber. Nothing here is drawn to look good; it is
 * computed and then drawn. The week strip is the same arithmetic per day.
 *
 * Entirely static: no timers, no state, no effects. Under reduced motion it is
 * already correct, because there is nothing to reduce.
 */

/** Planned minutes per day for the week strip. Monday first, today is Tuesday. */
const WEEK_PLANNED: readonly { day: string; minutes: number }[] = [
  { day: 'M', minutes: 300 },
  { day: 'T', minutes: 330 },
  { day: 'W', minutes: 240 },
  { day: 'T', minutes: 375 },
  { day: 'F', minutes: 180 },
  { day: 'S', minutes: 60 },
  { day: 'S', minutes: 0 },
]

/** Index of the day the composition is showing. */
const TODAY_INDEX = 1

export function ProductShot({ className }: { className?: string }) {
  const tasks = [...HERO_STEPS]
  const summary = demoSummary(tasks)

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-elevation-lg',
        className,
      )}
    >
      {/* Window chrome. Names the screen, so the visitor knows this is "Today"
          rather than a diagram someone drew for the marketing page. */}
      <div className="flex items-center justify-between border-b border-white/5 bg-surface-2/60 px-4 py-2.5">
        <p className="font-display text-sm font-semibold text-text-primary">Today</p>
        <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          Tue · {formatMinutes(DEMO_CAPACITY_MINUTES)} available
        </p>
      </div>

      <div className="space-y-4 p-4">
        {/* The signature meter, at its finished state. */}
        <DemoMeter summary={summary} title="Today’s capacity" titleAs="p" showMessage />

        {/* The work that fills it. Time on every row is the differentiator, so
            it is never truncated away, even at 390px. */}
        <ul className="space-y-1.5">
          {tasks.map((task, index) => {
            const focused = index === 1
            return (
              <li
                key={task.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2',
                  focused
                    ? 'border-brand/40 bg-brand-gradient-soft'
                    : 'border-white/5 bg-surface-2/40',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 rounded-full border',
                    focused ? 'border-brand bg-brand/30' : 'border-white/20',
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {task.title}
                </span>
                {focused ? (
                  // The one row that is being worked. This is the whole point of
                  // the composition: the plan and the doing are the same screen.
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand/20 px-2 py-1 font-mono text-[11px] text-text-primary">
                    <Timer className="h-3 w-3 text-brand" aria-hidden />
                    24:18
                  </span>
                ) : (
                  <span className="shrink-0 font-mono text-[11px] text-text-muted">
                    {formatMinutes(task.effort)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        {/* The week the day sits inside. Small on purpose: it is orientation,
            not a second product screen competing with the first. */}
        <div className="rounded-xl border border-white/5 bg-background/60 px-3 py-2.5">
          <div className="flex items-end justify-between gap-1.5">
            {WEEK_PLANNED.map((entry, index) => {
              const pct = Math.min(100, Math.round((entry.minutes / DEMO_CAPACITY_MINUTES) * 100))
              const isToday = index === TODAY_INDEX
              return (
                <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-8 w-full items-end overflow-hidden rounded bg-surface-2/60">
                    <div
                      className={cn(
                        'w-full rounded',
                        pct >= 100 ? 'bg-danger' : isToday ? 'bg-brand-gradient' : 'bg-brand/40',
                      )}
                      style={{ height: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      'font-mono text-[10px]',
                      isToday ? 'text-text-primary' : 'text-text-muted',
                    )}
                  >
                    {entry.day}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-center text-[11px] text-text-muted">
            The week ahead, each day with its own capacity
          </p>
        </div>
      </div>
    </div>
  )
}
