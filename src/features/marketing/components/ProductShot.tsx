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
 * ── TWO REVIEWERS INDEPENDENTLY CALLED THE FIRST VERSION A LAYOUT BUG ──────
 *
 * It threw rows sideways and let them land wherever the arithmetic put them.
 * Because the card clips its overflow, that produced four hard-cropped strings
 * in a single 390px viewport ("1h 30", "APPOINTMEN", "WELLBEIN", "45"), and
 * because nothing coordinated the vertical offsets it also printed "Dentist at
 * 3:00" directly on top of "Pick up groceries". Clipped words against a sharp
 * frame edge and two opaque strings sharing one line are the visual signature
 * of a broken component, not of motion. Somebody who has never seen the page
 * before cannot tell the difference, and they only get the one look.
 *
 * ── THE TWO RULES THAT REPLACED THE GUESSWORK ─────────────────────────────
 *
 *   1  NOTHING MOVES SIDEWAYS. `dx` is zero for every row, at every width, so
 *      no label can ever reach a frame edge to be cut against it. The whole
 *      horizontal budget is spent on keeping the words readable, which is the
 *      only reason the storm is made of real obligations rather than particles.
 *
 *   2  EVERY ROW GETS ITS OWN SLOT. The ten items are dealt into ten distinct
 *      positions on a 34px pitch, in a SHUFFLED order. No two rows can share a
 *      line, so no two strings can ever overprint, and the disorder is now the
 *      one thing a to-do list is actually bad at: the wrong things in the wrong
 *      order. Settling then reads as sorting, which is the argument the section
 *      is making.
 *
 * Corners still overlap slightly once rotated, and that is left alone on
 * purpose: overlapping CORNERS read as a pile of paper, while overlapping TEXT
 * reads as a bug. Text sits vertically centred in each row, so with a 34px
 * pitch the baselines stay 34px apart no matter how the boxes tilt.
 *
 * The geometry these numbers come from: seven rows of `h-9` (36px) on a 6px
 * rhythm is a 42px pitch, and the "did not fit" box sits 16px below the last of
 * them. Slot k is therefore `k * 34`, and each row's `dy` is the distance from
 * its own resting top to that slot, expressed as a percentage of its own 36px
 * height because that is what a percentage translate is relative to.
 */
const SCATTER: readonly { dy: string; rot: string; scale: number }[] = [
  { dy: '189%', rot: '2.5deg', scale: 0.88 },
  { dy: '-117%', rot: '-2deg', scale: 0.9 },
  { dy: '239%', rot: '-2.5deg', scale: 0.88 },
  { dy: '-256%', rot: '2deg', scale: 0.89 },
  { dy: '289%', rot: '2.5deg', scale: 0.88 },
  { dy: '-300%', rot: '-2.5deg', scale: 0.9 },
  { dy: '-133%', rot: '2deg', scale: 0.89 },
  /*
   * The last three are the ones that will not fit. They rest stacked in a
   * single 36px box at the bottom, so all three start from the same top and
   * need much larger offsets than the rows above to reach a slot of their own.
   */
  { dy: '-467%', rot: '-2deg', scale: 0.88 },
  { dy: '-183%', rot: '2.5deg', scale: 0.9 },
  { dy: '6%', rot: '-2.5deg', scale: 0.88 },
]

/**
 * The phone uses the SAME slots and the same zero horizontal travel, with the
 * tilt halved. A narrower card means a rotated row's corners travel further
 * relative to the space beside them, and there is no width to spare.
 */
const MOBILE_SCATTER = SCATTER.map((row) => ({
  mdy: row.dy,
  mrot: `${(Number.parseFloat(row.rot) / 2).toFixed(2)}deg`,
}))

type Act = 'storm' | 'settled' | 'working' | 'done'

function scatterVars(index: number, delayMs: number): CSSProperties {
  return {
    '--dy': SCATTER[index].dy,
    '--rot': SCATTER[index].rot,
    '--scale': SCATTER[index].scale,
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
        {/*
          "AVAILABLE", NOT "TO WORK WITH", AND THE DAY IS NOT TYPED HERE.

          The old line ran "TUE · 6H TO WORK WITH", which ends flush against the
          card's inner edge at every width. It is grammatically complete and it
          READS as a sentence that was cut off, which is the one thing a product
          shot in a hero cannot afford. "Available" says the same thing in one
          word, and it is the plain-English version of the idea without
          reaching back for "capacity", which is the in-app name and the wrong
          register for a stranger.

          The weekday now comes from the SAME fixture that decides which column
          of the week strip below is highlighted. It used to be the string
          "Tue" typed here while `TODAY_INDEX` independently pointed at column
          one: two sources for one fact, and nothing would have failed if they
          had drifted apart. The hours were already derived and still are.
        */}
        <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          {WEEK[TODAY_INDEX].short} · {formatMinutes(HERO_DAY_MINUTES)} available
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
            {/*
              A LABEL OVER AN EMPTY SLOT READS AS A FAILED FETCH.

              This used to be the real value held at `opacity-0` until the storm
              settled, which meant the card's very first frame showed "What fits
              today" with nothing underneath it. A review of the rendered page
              called that out at three separate widths as the clearest symptom
              of a broken component, and it is: a labelled field with nothing in
              it, sitting next to a field that filled, is exactly what a failed
              request looks like.
              It now carries a waiting state instead. The slot is occupied from
              the first frame, the answer genuinely is not known yet while ten
              obligations are still landing, and the swap to the real figure is
              the moment the plan exists.
            */}
            <p
              className={cn(
                'font-mono text-sm font-medium tabular-nums transition-colors duration-500 sm:text-base motion-reduce:transition-none',
                scattered ? 'text-text-muted/60' : 'text-text-primary',
              )}
            >
              {scattered ? (
                <span aria-hidden>· · ·</span>
              ) : (
                <>
                  {formatMinutes(HERO_PLANNED_MINUTES)} of {formatMinutes(HERO_DAY_MINUTES)} ·{' '}
                  {formatMinutes(HERO_OPEN_MINUTES)} left
                </>
              )}
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
              className="mt-2 h-2 overflow-hidden rounded-full bg-black/40 ring-1 ring-inset ring-white/10"
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

                {/*
                  THIS COLUMN IS THE LIFE CLAIM, PROVED RATHER THAN ASSERTED.
                  Health, Work, Errands, Family, Money, Personal read down the
                  card beside the tasks, which is the strongest evidence on the
                  page that this is not an office tool. It was set at 70% of an
                  already-muted grey, which a review of the rendered page put at
                  the floor of legibility. Dim is right for a secondary column;
                  unreadable is not, and an unreadable proof proves nothing.
                */}
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-muted">
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
                {/*
                  THIS COLUMN IS THE LIFE CLAIM, PROVED RATHER THAN ASSERTED.
                  Health, Work, Errands, Family, Money, Personal read down the
                  card beside the tasks, which is the strongest evidence on the
                  page that this is not an office tool. It was set at 70% of an
                  already-muted grey, which a review of the rendered page put at
                  the floor of legibility. Dim is right for a secondary column;
                  unreadable is not, and an unreadable proof proves nothing.
                */}
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-muted">
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
                    {/* One letter, taken from the label rather than typed
                        again: M T W T F S S. */}
                    {entry.short.charAt(0)}
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

/**
 * Planned minutes per day for the week strip. Monday first; today is Tuesday.
 *
 * `short` is the only place a day is named. The card's header reads it for
 * "TUE", and the strip renders its first letter, so the highlighted column and
 * the header can never disagree about what day the demo is showing. It is a
 * FIXTURE, not the real date, deliberately: the strip highlights a specific
 * column and the day the header names has to be that same column, which a live
 * `new Date()` would break every day except Tuesday. It also keeps every
 * screenshot of this hero comparable with every other one.
 */
const WEEK: readonly { short: string; minutes: number }[] = [
  { short: 'Mon', minutes: 300 },
  { short: 'Tue', minutes: HERO_PLANNED_MINUTES },
  { short: 'Wed', minutes: 240 },
  { short: 'Thu', minutes: 315 },
  { short: 'Fri', minutes: 180 },
  { short: 'Sat', minutes: 90 },
  { short: 'Sun', minutes: 45 },
]

const TODAY_INDEX = 1
