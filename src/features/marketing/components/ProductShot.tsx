import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '../demo/useReveal'
import {
  HERO_DAY,
  HERO_DAY_MINUTES,
  HERO_OPEN_MINUTES,
  HERO_PLANNED_MINUTES,
  heroProgressPercent,
} from '../demo/heroDay'

/**
 * THE HERO: A DAY THAT FITS, AND THEN GETS FINISHED.
 *
 * ── WHAT IT REPLACES, AND WHY THAT VERSION WAS WRONG ───────────────────────
 *
 * The live hero was a static card reading "Today's capacity / 92% planned",
 * amber, over the sentence "Nearly full. Add only what really matters today."
 * Every one of its five tasks was work.
 *
 * Two things were wrong with that, and they compound.
 *
 * FIRST, THE NUMBER COULD ONLY EVER END IN A WARNING. 92% is 330 minutes
 * planned over a 360 minute day: PLANNING LOAD. It is a real and important
 * figure, but as the headline of a hero it has no happy ending, because the
 * best it can do is approach "full". A visitor watched a day get booked up and
 * then nothing happened. The card's final emotional state was caution.
 *
 * SECOND, THE DAY WAS ALL WORK, so the first impression of a product meant for
 * organising a life was a business tool.
 *
 * ── TWO METRICS, KEPT SEPARATE ─────────────────────────────────────────────
 *
 * The bar now measures PROGRESS, counted in tasks, and it lands on exactly 100.
 *
 * The load figure has NOT been dropped, because it is the product's whole
 * argument: it is the "Today's plan" line above the bar, stating what the day
 * held, what was promised to it, and what was deliberately left open. That line
 * never moves. A plan you committed to once should not appear to shrink while
 * you work it, and freezing it is what lets both ideas sit on one card without
 * contradicting each other. The day gets finished BECAUSE it was a day that
 * fit, and both numbers are on screen saying so.
 *
 * (In the real app the capacity meter counts REMAINING incomplete effort, so a
 * finished day empties it to zero. That is the correct behaviour in the product
 * and the wrong story for a hero, which is exactly why the hero labels this
 * line "Today's plan" rather than borrowing the meter.)
 *
 * ── IT RUNS ONCE AND STOPS ON THE PAYOFF ───────────────────────────────────
 *
 * No loop. A hero that keeps resetting is a GIF advert, and the reset undoes
 * the exact feeling the sequence exists to produce. It plays, it finishes, it
 * rests at a completed day. Under reduced motion it is already at that state on
 * the first frame, which is the right static answer for this hero: the
 * meaningful state is the finished one, never an empty list at 0%.
 *
 * ── NOTHING MOVES WHEN A TASK COMPLETES ────────────────────────────────────
 *
 * Every row is a fixed height and the trailing cell is a fixed width, so the
 * duration swapping for a tick cannot reflow the card. The strike-through and
 * the muted text are colour changes, not layout changes. A hero that shifts
 * while a visitor reads it is worse than a hero that does not move at all.
 */

/** Milliseconds between two tasks completing. */
const STEP_MS = 620
/** A beat before the first one, so the visitor sees the starting state. */
const LEAD_MS = 900

export function ProductShot({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion()
  const total = HERO_DAY.length
  const [done, setDone] = useState(reduced ? total : 0)

  useEffect(() => {
    if (reduced) {
      setDone(total)
      return
    }
    setDone(0)
    let step = 0
    let interval = 0
    const lead = window.setTimeout(() => {
      interval = window.setInterval(() => {
        step += 1
        setDone(step)
        // Runs once. There is no restart: the finished day is the resting state.
        if (step >= total) window.clearInterval(interval)
      }, STEP_MS)
    }, LEAD_MS)
    return () => {
      window.clearTimeout(lead)
      if (interval) window.clearInterval(interval)
    }
  }, [reduced, total])

  const percent = heroProgressPercent(done)
  const finished = done >= total

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-elevation-lg',
        className,
      )}
    >
      {/* Window chrome. Names the screen, so this reads as the product rather
          than a diagram drawn for a marketing page. */}
      <div className="flex items-center justify-between border-b border-white/5 bg-surface-2/60 px-4 py-2.5">
        <p className="font-display text-sm font-semibold text-text-primary">Today</p>
        <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          Tue · {formatMinutes(HERO_DAY_MINUTES)} to work with
        </p>
      </div>

      <div className="space-y-4 p-4">
        {/*
          ── TWO NUMBERS, TWO LINES, ONE BAR ──────────────────────────────
          "Today's plan" is the commitment: what the day holds, what was
          promised to it, and what was deliberately left alone. It does not
          move, because a plan you made once should not appear to shrink while
          you work it.
          "Today's progress" is the bar, and it is the only thing that moves.
        */}
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-text-primary">Today’s plan</p>
            <p className="font-mono text-xs tabular-nums text-text-muted">
              {formatMinutes(HERO_PLANNED_MINUTES)} of {formatMinutes(HERO_DAY_MINUTES)} ·{' '}
              {formatMinutes(HERO_OPEN_MINUTES)} left
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-text-primary">Today’s progress</p>
              <p
                className={cn(
                  'font-mono text-sm tabular-nums transition-colors duration-300 motion-reduce:transition-none',
                  finished ? 'text-success' : 'text-text-muted',
                )}
              >
                {percent}%
              </p>
            </div>

            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
              role="img"
              aria-label={`Today's progress: ${done} of ${total} tasks done`}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none',
                  finished ? 'bg-success' : 'bg-brand-gradient',
                )}
                style={{ width: `${percent}%` }}
              />
            </div>

            {/* Fixed height, so the closing line replacing the count cannot
                move a single pixel of the card. */}
            <p className="mt-2 h-[18px] overflow-hidden text-xs leading-[18px]">
              {finished ? (
                <span className="text-success">Plan complete. {total} of {total} done.</span>
              ) : (
                <span className="text-text-muted">
                  {done} of {total} done
                </span>
              )}
            </p>
          </div>
        </div>

        {/* ── The day itself ───────────────────────────────────────────── */}
        <ul className="space-y-1.5">
          {HERO_DAY.map((task, index) => {
            const complete = index < done
            return (
              <li
                key={task.id}
                className={cn(
                  'flex h-9 items-center gap-2.5 rounded-xl border px-3 transition-colors duration-300 motion-reduce:transition-none',
                  complete
                    ? 'border-success/25 bg-success/[0.07]'
                    : 'border-white/5 bg-surface-2/40',
                )}
              >
                {/* Fixed box, so a tick appearing cannot move the title. */}
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 motion-reduce:transition-none',
                    complete ? 'border-success bg-success/20 text-success' : 'border-white/20',
                  )}
                >
                  {complete && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                </span>

                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm transition-colors duration-300 motion-reduce:transition-none',
                    complete ? 'text-text-muted line-through' : 'text-text-primary',
                  )}
                >
                  {task.title}
                </span>

                {/*
                  The quiet category label. It is what makes the day read as a
                  life at a glance rather than a workload, and it is one muted
                  word rather than a colour per row: six tinted chips in a card
                  this size is a rainbow.

                  Shown at EVERY width, including 390. It was `sm:` only, which
                  hid the life signal on the surface where the complaint
                  started; the titles alone carry it, but the labels are what
                  make the spread obvious in a glance, and they measure well
                  inside the row even at 320.
                */}
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
                  {task.category}
                </span>

                <span
                  className={cn(
                    'w-[52px] shrink-0 text-right font-mono text-[11px] tabular-nums transition-colors duration-300 motion-reduce:transition-none',
                    complete ? 'text-success' : 'text-text-muted',
                  )}
                >
                  {formatMinutes(task.minutes)}
                </span>
              </li>
            )
          })}
        </ul>

        {/* The week the day sits inside. Orientation, not a second screen. */}
        <div className="rounded-xl border border-white/5 bg-background/60 px-3 py-2.5">
          <div className="flex items-end justify-between gap-1.5">
            {WEEK.map((entry, index) => {
              const pct = Math.min(100, Math.round((entry.minutes / HERO_DAY_MINUTES) * 100))
              const isToday = index === TODAY_INDEX
              return (
                <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-8 w-full items-end overflow-hidden rounded bg-surface-2/60">
                    <div
                      className={cn(
                        'w-full rounded',
                        // Mint for today because today is finished; softened so
                        // it reinforces the completion rather than competing
                        // with the progress bar above it.
                        isToday ? 'bg-success/75' : 'bg-brand/40',
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
            The week ahead, each day planned around the time it really has
          </p>
        </div>
      </div>
    </div>
  )
}

/** Planned minutes per day for the week strip. Monday first; today is Tuesday. */
const WEEK: readonly { day: string; minutes: number }[] = [
  { day: 'M', minutes: 300 },
  { day: 'T', minutes: HERO_PLANNED_MINUTES },
  { day: 'W', minutes: 240 },
  { day: 'T', minutes: 315 },
  { day: 'F', minutes: 180 },
  { day: 'S', minutes: 90 },
  { day: 'S', minutes: 45 },
]

const TODAY_INDEX = 1
