import { useEffect, useState } from 'react'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Reveal } from '../demo/Reveal'
import { useInView, usePrefersReducedMotion } from '../demo/useReveal'
import {
  PROBLEM_CAPACITY_MINUTES,
  PROBLEM_TASKS,
  problemSummaryAt,
} from '../demo/problemFixture'
import { SECTION_RHYTHM } from '../sectionRhythm'

/**
 * THE ENEMY, STATED AS ARITHMETIC.
 *
 * Everything after this section is an answer. Without it the page opened with a
 * solution to a problem it had never named, which is why a visitor could read
 * the whole capacity demo and still think "so it is a to-do list with a timer".
 *
 * ── THE ARGUMENT IS A SUM, NOT AN ADJECTIVE ────────────────────────────────
 *
 * There is no claim here about other software being bad, and no named
 * competitor. The section shows ten ordinary tasks, adds them up with the
 * product's REAL `computeCapacity`, and lets the total be the argument. Every
 * line is individually reasonable, which is the point: nobody plans an
 * impossible day on purpose, they plan ten possible things and never add them
 * up. A parody list would let the reader off the hook.
 *
 * ── THE ONE INTERVAL THAT MOVES ────────────────────────────────────────────
 *
 * Tasks are counted in one at a time and the total climbs with them. That is
 * motion doing explanatory work rather than decoration: the reader watches the
 * number cross the line, which is the whole idea in one gesture. It is TEN
 * state updates over about two seconds, not a per-frame counter, so the cost is
 * negligible and the crossing lands on a real task rather than mid-tween.
 *
 * Under `prefers-reduced-motion` the finished state renders immediately, with
 * every number and the overflow already in place. Nothing is hidden behind the
 * animation, so the section reads identically with no motion and with no JS
 * beyond the first render.
 */

/** Milliseconds between counted items. Slow enough to read, done in ~2s. */
const STEP_MS = 190

/**
 * The tallest thing the column has to draw: the finished total. The capacity
 * line therefore sits at capacity/total from the bottom, and the overflow has
 * somewhere real to go instead of being clipped at 100%.
 */
const TOTAL_MINUTES = problemSummaryAt(PROBLEM_TASKS.length).plannedMinutes

export function ProblemSection() {
  const reduced = usePrefersReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ rootMargin: '0px 0px -15% 0px' })

  /*
   * Start finished under reduced motion: the reveal is the decoration, the sum
   * is the content, and the content must never wait on the decoration.
   *
   * AND START FINISHED WHERE NOTHING CAN EVER ANIMATE IT.
   *
   * This list is built one item at a time by a setInterval, so anywhere that
   * effect does not run the count stays 0 and every row renders `opacity-0`
   * forever. That was invisible while the page only ever existed in a browser.
   * Prerendering made it visible: the built HTML carried all ten task titles at
   * zero opacity, permanently — a reader with JavaScript off saw an empty
   * column under "A list can grow forever", which is the one section where the
   * list IS the argument.
   *
   * `IntersectionObserver` is the same tell `useReveal` uses: present in every
   * browser that can run the animation, absent on the server. So this is still
   * 0 on the first client render and the count-up is completely unchanged.
   */
  const [counted, setCounted] = useState(() =>
    reduced || typeof IntersectionObserver === 'undefined' ? PROBLEM_TASKS.length : 0,
  )

  useEffect(() => {
    if (reduced) {
      setCounted(PROBLEM_TASKS.length)
      return
    }
    if (!inView) return
    let n = 0
    const id = window.setInterval(() => {
      n += 1
      setCounted(n)
      if (n >= PROBLEM_TASKS.length) window.clearInterval(id)
    }, STEP_MS)
    return () => window.clearInterval(id)
  }, [inView, reduced])

  const summary = problemSummaryAt(counted)
  const final = problemSummaryAt(PROBLEM_TASKS.length)
  const over = summary.overMinutes > 0

  // Both measured against the FINISHED total, so the capacity line is fixed and
  // only the fill moves. A line that slid around as the total grew would be
  // unreadable, and would quietly undermine the one fixed quantity in the story.
  const fillPct = (Math.min(summary.plannedMinutes, PROBLEM_CAPACITY_MINUTES) / TOTAL_MINUTES) * 100
  const overPct = (summary.overMinutes / TOTAL_MINUTES) * 100
  const capacityPct = (PROBLEM_CAPACITY_MINUTES / TOTAL_MINUTES) * 100

  return (
    <section className={cn(SECTION_RHYTHM, 'max-w-6xl')} aria-labelledby="the-problem">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Why days slip</p>
        <h2
          id="the-problem"
          className="mt-3 font-display text-3xl font-bold leading-[1.08] tracking-tight md:text-4xl lg:mt-4 lg:text-6xl lg:leading-[1.05]"
        >
          A list can grow forever.
          <span className="mt-1 block text-warning">A day cannot.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-text-muted sm:mt-6 sm:text-lg">
          Nobody plans an impossible day on purpose. They plan ten reasonable things and never add
          up the minutes.
        </p>
      </Reveal>

      <div
        ref={ref}
        className="mt-10 grid items-center gap-8 sm:mt-16 sm:gap-10 lg:grid-cols-[1.15fr_auto] lg:gap-16"
      >
        {/* ── The receipt ─────────────────────────────────────────────────
            Deliberately not a card: a plain ruled column of text reads as a
            list somebody actually wrote, which is what it is meant to be. */}
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-text-muted">
            What you wrote down
          </p>
          <ul className="mt-4">
            {PROBLEM_TASKS.map((task, i) => {
              const shown = i < counted
              return (
                <li
                  key={task.id}
                  className={cn(
                    'flex items-baseline gap-4 border-b border-white/5 py-2 text-sm sm:py-2.5 sm:text-base',
                    !reduced && 'transition-opacity duration-500',
                    shown ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-text-primary/90">{task.title}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted sm:text-sm">
                    {formatMinutes(task.effort)}
                  </span>
                </li>
              )
            })}
          </ul>

          <div className="mt-5 flex items-baseline gap-4">
            <span className="flex-1 font-display text-base font-semibold sm:text-lg">
              What that adds up to
            </span>
            <span
              className={cn(
                'shrink-0 font-mono text-2xl font-semibold tabular-nums transition-colors duration-300 sm:text-3xl',
                over ? 'text-danger' : 'text-text-primary',
              )}
              // The running total is the one number that changes, so it is the
              // one worth announcing. Everything else is static text already.
              aria-live="polite"
              aria-atomic="true"
            >
              {formatMinutes(summary.plannedMinutes)}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-muted">
            Against a {formatMinutes(PROBLEM_CAPACITY_MINUTES)} working day.
          </p>
        </div>

        {/* ── The day, drawn to scale ─────────────────────────────────────
            The fill and the line share one denominator (the finished total),
            so the overflow is genuinely proportional rather than a graphic
            gesture. What spills past the line is what will not happen. */}
        <div className="flex items-end justify-center gap-5 lg:gap-8">
          <div
            className="relative h-[240px] w-20 sm:h-[380px] sm:w-28"
            role="img"
            aria-label={`${formatMinutes(final.plannedMinutes)} of work drawn against a ${formatMinutes(
              PROBLEM_CAPACITY_MINUTES,
            )} day, overflowing it by ${formatMinutes(final.overMinutes)}`}
          >
            {/* The vessel: everything at or below the line is the day itself. */}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 rounded-2xl border border-white/10 bg-surface/60"
              style={{ height: `${capacityPct}%` }}
            />

            {/* Time that fits. */}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 rounded-2xl bg-brand-gradient transition-[height] duration-500 ease-out"
              style={{ height: `${fillPct}%` }}
            />

            {/* Time that does not. It sits ABOVE the vessel's rim on purpose:
                clipping it at 100% would have hidden the only quantity the
                section is about. */}
            <div
              aria-hidden
              className="absolute inset-x-0 rounded-t-2xl bg-danger/80 transition-[height,bottom] duration-500 ease-out"
              style={{ bottom: `${capacityPct}%`, height: `${overPct}%` }}
            />

            {/* The rim. */}
            <div
              aria-hidden
              className="absolute inset-x-[-14px] border-t border-dashed border-white/40"
              style={{ bottom: `${capacityPct}%` }}
            />
          </div>

          <div className="pb-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted sm:text-xs">
              Your day
            </p>
            <p className="font-display text-lg font-semibold sm:text-xl">
              {formatMinutes(PROBLEM_CAPACITY_MINUTES)}
            </p>
            {over && (
              <p className="mt-4 max-w-[9rem] text-xs leading-relaxed text-danger sm:text-sm">
                {formatMinutes(summary.overMinutes)} of this was never going to happen.
              </p>
            )}
          </div>
        </div>
      </div>

      <Reveal className="mx-auto mt-8 max-w-2xl text-center sm:mt-14">
        <p className="text-base leading-relaxed text-text-primary/90 sm:text-lg">
          A plain list will never tell you this. It has no idea how long your day is, so it lets you
          keep adding. The overflow does not disappear. It becomes tomorrow&rsquo;s guilt, and the
          day after that.
        </p>
      </Reveal>
    </section>
  )
}
