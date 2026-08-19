import { useEffect, useState, type CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '../demo/useReveal'
import {
  HERO_DAY,
  HERO_DAY_MINUTES,
  HERO_LATER,
  HERO_OPEN_MINUTES,
  HERO_PLANNED_MINUTES,
  heroProgressPercent,
} from '../demo/heroDay'

/**
 * THE HERO: TEN THINGS WANT TODAY, SEVEN FIT, AND THEY GET DONE.
 *
 * ── THE STORY, IN FOUR ACTS ────────────────────────────────────────────────
 *
 *   1  STORM     ten obligations from nine parts of a life, scattered.
 *   2  SETTLED   they land in one plan, and the time appears: 5h 30m of 6h.
 *                The three that do not fit are demoted, not deleted.
 *   3  WORKING   the plan gets worked. Tasks tick off, progress rises.
 *   4  DONE      it rests at 100%.
 *
 * ── WHY THE SAME ELEMENTS SCATTER AND LAND ─────────────────────────────────
 *
 * The rows a viewer watches fly in ARE the rows that end up in the plan. They
 * never leave normal flow; they only ever carry a `transform`. Two things
 * follow, and both matter more than they look.
 *
 * The card's geometry is IDENTICAL in every act, so nothing on the page can
 * shift while the story plays. And the metaphor stays honest: this is one set
 * of obligations being organised, not a mess swapped for a screenshot of a tidy
 * list. Built as two separate compositions, the viewer would be watching a
 * slideshow and would have to take the connection on trust.
 *
 * ── THE THREE THAT DO NOT FIT ARE THE POINT ────────────────────────────────
 *
 * Ten things arrive and seven fit. The other three do not evaporate; they
 * settle into one quiet line saying where they went, because a product whose
 * whole argument is that a day has a limit cannot show a day absorbing
 * everything. It is also what the app really does: unscheduled work waits in
 * the Inbox.
 *
 * ── THE TORNADO, WITHOUT THE WEATHER ───────────────────────────────────────
 *
 * The product is called Todonado and the owner asked for "a tornado of tasks".
 * What is built is an authored scatter that settles: trajectories from
 * different angles, a little rotation, a slight scale, resolving into one calm
 * column. No funnel, no spinning, no clouds. The storm is in the arrival rather
 * than in a picture of a storm, and every label stays upright enough to read,
 * because a viewer has to recognise these as their own obligations rather than
 * as particles.
 *
 * Transform and opacity only, no dependency, and no blur on anything that
 * moves: this page already paid for that lesson once, when a blurred moving
 * layer took scrolling from 60fps to 21.
 */

/** Act boundaries in ms from mount. Storm 0-1.5s, settle, work, done by ~5.6s. */
const SETTLE_AT = 1500
const FIRST_TICK_AT = 2900
const TICK_EVERY = 380

/**
 * Authored scatter per row. Deterministic, so every visit sees the same storm.
 *
 * THE HORIZONTAL RANGE IS DELIBERATELY NARROW. The first version threw rows
 * out to +/-52%, and the card clips its overflow, so half the labels were cut
 * mid-word at the frame edge: it read as a broken component rather than as a
 * storm. The disorder now lives mostly in the VERTICAL offset and the rotation,
 * where it costs no legibility, because the whole requirement is that a viewer
 * recognises these as their own obligations rather than as particles.
 */
const SCATTER: readonly { dx: string; dy: string; rot: string; scale: number }[] = [
  { dx: '-14%', dy: '-124%', rot: '-7deg', scale: 0.93 },
  { dx: '18%', dy: '-56%', rot: '5deg', scale: 0.95 },
  { dx: '-20%', dy: '22%', rot: '6deg', scale: 0.94 },
  { dx: '15%', dy: '88%', rot: '-5deg', scale: 0.96 },
  { dx: '-11%', dy: '136%', rot: '4deg', scale: 0.93 },
  { dx: '19%', dy: '-100%', rot: '-6deg', scale: 0.95 },
  { dx: '-17%', dy: '80%', rot: '7deg', scale: 0.94 },
  /*
   * The last three are the ones that will not fit, and their resting place is a
   * single 36px box at the BOTTOM of the card, so they all share one anchor.
   * Scattering them by the same modest offsets as the rows above piled them on
   * top of each other in a heap. They need to travel much further up to join
   * the storm at all, which is why their offsets are an order of magnitude
   * larger than everything above.
   */
  { dx: '12%', dy: '-560%', rot: '5deg', scale: 0.92 },
  { dx: '-16%', dy: '-330%', rot: '-6deg', scale: 0.95 },
  { dx: '14%', dy: '-140%', rot: '6deg', scale: 0.93 },
]

/** The phone gets a vertical drop from alternating sides, never a vortex. */
const MOBILE_SCATTER = SCATTER.map((_, i) => ({
  mdx: i % 2 === 0 ? '-11%' : '11%',
  // The seven planned rows drop from alternating sides; the three that will not
  // fit share one anchor at the bottom, so they get their own wider spread or
  // they land in a heap.
  mdy: i < 7 ? `${-58 + i * 14}%` : `${-520 + (i - 7) * 190}%`,
  mrot: i % 2 === 0 ? '-3deg' : '3deg',
}))

type Act = 'storm' | 'settled' | 'working' | 'done'

function scatterVars(index: number, delayMs: number): CSSProperties {
  return {
    '--dx': SCATTER[index].dx,
    '--dy': SCATTER[index].dy,
    '--rot': SCATTER[index].rot,
    '--scale': SCATTER[index].scale,
    '--mdx': MOBILE_SCATTER[index].mdx,
    '--mdy': MOBILE_SCATTER[index].mdy,
    '--mrot': MOBILE_SCATTER[index].mrot,
    transitionDelay: `${delayMs}ms`,
  } as CSSProperties
}

export function ProductShot({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion()
  const total = HERO_DAY.length
  const [act, setAct] = useState<Act>(reduced ? 'done' : 'storm')
  const [done, setDone] = useState(reduced ? total : 0)

  useEffect(() => {
    if (reduced) {
      setAct('done')
      setDone(total)
      return
    }
    setAct('storm')
    setDone(0)

    const timers: number[] = []
    timers.push(window.setTimeout(() => setAct('settled'), SETTLE_AT))
    timers.push(
      window.setTimeout(() => {
        setAct('working')
        let step = 0
        const interval = window.setInterval(() => {
          step += 1
          setDone(step)
          // Runs ONCE. The finished plan is the resting state, never a loop.
          if (step >= total) {
            window.clearInterval(interval)
            setAct('done')
          }
        }, TICK_EVERY)
        timers.push(interval)
      }, FIRST_TICK_AT),
    )
    /*
     * `clearTimeout` clears the interval too: the HTML spec gives timeouts and
     * intervals one handle space, so one teardown loop covers both. Collecting
     * them in an array is what stops a later act's timer being the one nobody
     * remembers to clear.
     */
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [reduced, total])

  const scattered = act === 'storm'
  const percent = heroProgressPercent(done)
  const finished = done >= total

  return (
    <div
      className={cn(
        /*
          A LIT OBJECT ON A DARK FLOOR.

          This was `bg-surface` (#0F172A) sitting on a `#0A0D16` hero: a step of
          delta-L* 4.3, which an audit of the rendered page measured as 1.09:1 -
          below the level at which an edge registers in peripheral vision. The
          card did not read as raised, it read as a slightly different patch of
          the same darkness, and "slightly different patch of darkness" is what
          made it look cheap.

          `bg-surface-2` (#1E293B) is a step of delta-L* 12.7. The rows inside
          then have to go the other way - they are recessed into the slab rather
          than raised out of it - which is why they carry `bg-background` below.
        */
        'overflow-hidden rounded-2xl border border-white/10 bg-surface-2 shadow-elevation-lg',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <p className="font-display text-sm font-semibold text-text-primary">Today</p>
        <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          Tue · {formatMinutes(HERO_DAY_MINUTES)} to work with
        </p>
      </div>

      <div className={cn('space-y-4 p-4', scattered ? 'storm--chaos' : 'storm--settled')}>
        {/*
          TWO NUMBERS, KEPT SEPARATE, AND NAMED AS QUESTIONS.

          "What fits today" is the commitment and never moves. "How today is
          going" is the only thing that fills. One bar labelled "92% planned"
          asked both questions at once and could only ever end in a warning.

          THE LABELS ARE MARKETING COPY, NOT THE APP'S VOCABULARY, AND THAT IS
          DELIBERATE. In the product the control is called the Day Capacity
          meter, which is the right name for a thing you operate every morning
          and the wrong name for the first sentence a stranger reads: capacity
          is infrastructure vocabulary, and "Today's progress" is the label
          every app on earth already uses. These two are phrased as the
          questions a visitor is actually asking, they are parallel in shape so
          the pair reads as one thought, and each survives its own extremes -
          "How today is going" is honest at 0%, where "Progress: 0%" reads as
          failure, and at 100% where "done" would otherwise appear twice in
          adjacent lines.

          THE PLAN VALUE IS THE HERO'S FOCAL NUMBER. It is set larger than
          anything else in the card because it is the one thing on this page no
          competitor's hero can copy: the day, measured. It used to be 11px
          grey mono, which is to say the differentiator was on screen and
          illegible.
        */}
        <div className="space-y-2.5">
          {/*
            STACKED ON THE NARROWEST PHONES, INLINE EVERYWHERE ELSE.

            At 320px the card's inner width is about 256px and this row wants
            110px of label plus 190px of value. Squeezed into one line the
            label broke to "What fits / today" and the value had nowhere to go
            at all. 380 is where the two genuinely fit side by side, so that is
            where the row becomes a row - not `sm`, which would needlessly
            stack a 390px screen that has the width.
          */}
          <div className="flex flex-col gap-0.5 min-[380px]:flex-row min-[380px]:items-baseline min-[380px]:justify-between min-[380px]:gap-3">
            <p className="whitespace-nowrap text-sm font-medium text-text-muted">What fits today</p>
            <p
              className={cn(
                'font-mono text-sm font-medium tabular-nums text-text-primary transition-opacity duration-500 sm:text-base motion-reduce:transition-none',
                // The time appears as the storm settles, because that IS what
                // just happened: a pile of obligations became an amount of time.
                scattered ? 'opacity-0' : 'opacity-100',
              )}
            >
              {formatMinutes(HERO_PLANNED_MINUTES)} of {formatMinutes(HERO_DAY_MINUTES)} ·{' '}
              {formatMinutes(HERO_OPEN_MINUTES)} left
            </p>
          </div>

          <div>
            <div className="flex flex-col gap-0.5 min-[380px]:flex-row min-[380px]:items-baseline min-[380px]:justify-between min-[380px]:gap-3">
              <p className="whitespace-nowrap text-sm font-medium text-text-muted">How today is going</p>
              <p
                className={cn(
                  'font-mono text-sm font-medium tabular-nums transition-colors duration-300 sm:text-base motion-reduce:transition-none',
                  finished ? 'text-success' : 'text-text-muted',
                )}
              >
                {percent}%
              </p>
            </div>

            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-background"
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

            {/* Fixed height: the closing line replaces the count without
                moving a pixel. */}
            <p className="mt-2 h-[18px] overflow-hidden text-xs leading-[18px]">
              {finished ? (
                <span className="text-success">
                  Plan complete. {total} of {total} done.
                </span>
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
                  'storm-item flex h-9 items-center gap-2.5 rounded-xl border px-3 transition-colors duration-300 motion-reduce:transition-none',
                  complete
                    ? 'border-success/25 bg-success/[0.07]'
                    : 'border-white/5 bg-background/50',
                )}
                style={scatterVars(index, scattered ? 0 : index * 55)}
              >
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
                    // Completed text stays at `text-muted`, not fainter: a
                    // crossed-off task still has to be readable.
                    complete ? 'text-text-muted line-through' : 'text-text-primary',
                  )}
                >
                  {task.title}
                </span>

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

        {/*
          THE THREE THAT DID NOT FIT.

          They are real rows during the storm and one quiet line afterwards. Not
          deleted: a product built on "a day has a limit" has to show something
          being left out, and it must never look like the app lost it.

          One fixed-height box holds both states, so the demotion costs no
          layout. The scattered copies are `aria-hidden` and the summary line is
          not, so a screen reader meets this idea exactly once.
        */}
        <div className="relative h-9">
          <ul aria-hidden className="absolute inset-0 list-none">
            {HERO_LATER.map((task, index) => (
              <li
                key={task.id}
                className="storm-item storm-later absolute inset-x-0 top-0 flex h-9 items-center gap-2.5 rounded-xl border border-white/5 bg-background/50 px-3 transition-opacity duration-500"
                style={scatterVars(total + index, 0)}
              >
                <span className="h-4 w-4 shrink-0 rounded-full border border-white/20" />
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {task.title}
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
                  {task.category}
                </span>
              </li>
            ))}
          </ul>

          <p
            className={cn(
              'absolute inset-x-0 top-0 flex h-9 items-center justify-center rounded-xl border border-dashed border-white/10 px-3 text-center text-xs text-text-muted transition-opacity duration-500 motion-reduce:transition-none',
              scattered ? 'opacity-0' : 'opacity-100',
            )}
          >
            {HERO_LATER.length} more didn’t fit today. They’re waiting in your inbox.
          </p>
        </div>

        {/*
          The week the day sits inside. Orientation, not a second screen.

          IT CARRIES A PRO MARKER BECAUSE THE WEEK BOARD IS PRO. `week.board`
          and `week.autoPlan` are both paid in `entitlements.ts`, and an
          unmarked seven-day strip in the hero quietly promises a free user
          something they will not find after signing up. Everything else drawn
          in this card is free.
        */}
        <div className="rounded-xl border border-white/5 bg-background/50 px-3 py-2.5">
          <div className="flex items-end justify-between gap-1.5">
            {WEEK.map((entry, index) => {
              const pct = Math.min(100, Math.round((entry.minutes / HERO_DAY_MINUTES) * 100))
              const isToday = index === TODAY_INDEX
              return (
                <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-8 w-full items-end overflow-hidden rounded bg-background/70">
                    <div
                      className={cn(
                        'w-full rounded transition-colors duration-500 motion-reduce:transition-none',
                        isToday && finished ? 'bg-success/75' : 'bg-brand/40',
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
          <p className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-center text-[11px] text-text-muted">
            The week ahead, each day planned around the time it really has
            <span className="rounded bg-brand/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-brand">
              Pro
            </span>
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
