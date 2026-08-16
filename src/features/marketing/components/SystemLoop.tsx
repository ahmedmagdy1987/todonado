import {
  BarChart3,
  CalendarCheck,
  ChevronRight,
  Gauge,
  Timer,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Reveal } from '../demo/Reveal'
import { SECTION_RHYTHM } from '../sectionRhythm'

interface Station {
  n: number
  icon: LucideIcon
  name: string
  what: string
  /** The value this step hands to the next one. Mono, because it is data. */
  passes: string
}

/**
 * THE CONNECTED-SYSTEM CLAIM, MADE MECHANICALLY INSTEAD OF ADJECTIVALLY.
 *
 * "All in one" is the weakest sentence in productivity marketing: every visitor
 * has read it, it is unfalsifiable, and it describes a bundle rather than a
 * benefit. A bundle of five things that never speak to each other is five
 * subscriptions in one login, which is worth almost nothing.
 *
 * So this section does not claim breadth at all. It follows ONE NUMBER around a
 * circuit and shows it come back changed. Every hop below is a real function
 * that exists in this repository and runs for a signed-in user today:
 *
 *   1. `tasks.effort_minutes`               the estimate you type
 *   2. `computeCapacity`                    sums estimates against your day
 *   3. `planDay`                            fills today without going over
 *   4. `focus_sessions.actual_seconds`      what it really took
 *   5. `estimationBias`                     median(actual / estimate), fed back
 *                                           into the daily briefing's nudge
 *
 * That loop is the argument for one product rather than four, and it cannot be
 * assembled out of separate apps at any price: a timer in one tool cannot
 * correct an estimate held in another. Note what is NOT claimed anywhere here:
 * that anyone else does this badly. The circuit either exists or it does not.
 *
 * ── NO COMPETITOR IS NAMED, DELIBERATELY ───────────────────────────────────
 *
 * Naming one makes the page about them, invites a rebuttal, and dates the claim
 * the moment they ship something. Describing the SHAPE of a scattered setup is
 * both fairer and more durable, because the reader recognises their own from
 * the description rather than being told what to think about a product they may
 * like.
 */
/**
 * The one worked example the circuit carries, in numbers that DERIVE each other.
 *
 * Written as three independent strings these would agree today and drift the
 * first time someone tuned a word, leaving a page that demonstrates a
 * self-correcting system while contradicting itself. The bias is therefore
 * computed by the same expression `estimationBias` uses on real data
 * (`round((actual / estimate - 1) * 100)`), so the illustration cannot be wrong
 * about its own arithmetic.
 */
const EXAMPLE_ESTIMATE_MIN = 45
const EXAMPLE_ACTUAL_MIN = 58
const EXAMPLE_BIAS_PCT = Math.round((EXAMPLE_ACTUAL_MIN / EXAMPLE_ESTIMATE_MIN - 1) * 100)

const STATIONS: Station[] = [
  {
    n: 1,
    icon: Type,
    name: 'You estimate',
    what: 'Give the task the minutes you think it needs.',
    passes: `${EXAMPLE_ESTIMATE_MIN}m`,
  },
  {
    n: 2,
    icon: Gauge,
    name: 'The day counts it',
    what: 'Every estimate is added up against the hours you actually have.',
    passes: '5h 15m of 6h',
  },
  {
    n: 3,
    icon: CalendarCheck,
    name: 'The plan fits',
    what: 'One tap fills today up to the line and stops. What is left waits.',
    passes: 'today’s list',
  },
  {
    n: 4,
    icon: Timer,
    name: 'You do the work',
    what: 'A timer tied to that one task records how long it really took.',
    passes: `${EXAMPLE_ACTUAL_MIN}m actual`,
  },
  {
    n: 5,
    icon: BarChart3,
    name: 'It tells you the truth',
    what: 'Your estimates are compared with reality, and the gap gets a number.',
    passes: `you run ${EXAMPLE_BIAS_PCT}% long`,
  },
]

export function SystemLoop() {
  return (
    <section
      className="relative border-y border-white/5 bg-surface/20"
      aria-labelledby="system-loop"
    >
      <div className={cn(SECTION_RHYTHM, 'max-w-6xl')}>
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">One system</p>
          <h2
            id="system-loop"
            className="mt-4 font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl"
          >
            The number you write down
            <span className="block text-gradient-brand">comes back to you.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-text-muted sm:text-lg">
            Planning, focus and review are usually three separate tools, so nothing you learn on
            Friday ever reaches the estimate you type on Monday. Here it is one circuit.
          </p>
        </Reveal>

        {/* ── The "before": a shape, never a brand ────────────────────────
            Five boxes with nothing running between them. The reader recognises
            their own setup from the shape, which is both fairer than naming a
            product and more durable, since it cannot be made wrong by somebody
            else's release notes. */}
        <Reveal className="mt-12">
          <p className="text-center font-mono text-xs uppercase tracking-[0.18em] text-text-muted">
            What most setups look like
          </p>
          {/* No separators between the boxes. There used to be a middot after
              each one, which left a dot dangling on its own at the end of a
              wrapped line on a phone. The dashed borders already do the
              separating, and a separator that only looks right when nothing
              wraps is not a separator. */}
          <ul className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {['Tasks', 'Calendar', 'Timer', 'Notes', 'Habits'].map((label) => (
              <li key={label}>
                <span className="inline-block rounded-xl border border-dashed border-white/15 bg-background/40 px-3 py-2 text-xs text-text-muted sm:text-sm">
                  {label}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-center text-sm text-text-muted">
            Five places that never tell each other anything.
          </p>
        </Reveal>

        {/* ── The circuit ─────────────────────────────────────────────────
            Vertical rail on small screens, a five-across run with a visible
            return path from `lg`. Same content, same order, same markup: this
            is one ordered list at every width, so the loop reads correctly to
            a screen reader and to a crawler with no CSS at all. */}
        {/*
          TWO SHAPES, ONE LIST.

          Five stacked cards is the right composition at `lg`, where they sit
          side by side and the eye travels along a circuit. Stacked vertically
          on a phone the same markup was nearly 2,000px of scrolling for five
          short facts, and a loop you have to scroll for half a minute has
          stopped reading as a loop at all.

          Below `lg` each station is therefore one compact ROW: number, name and
          payload on a single line, with the explanation beneath. The order, the
          content and the markup are identical, so nothing is hidden from a
          screen reader or a crawler on either side of the breakpoint.
        */}
        <ol className="mt-12 grid gap-3 lg:mt-14 lg:grid-cols-5 lg:gap-4">
          {STATIONS.map(({ n, icon: Icon, name, what, passes }, i) => (
            <li key={n} className="relative">
              <Reveal delay={i * 70} direction="scale" className="h-full">
                <div className="flex h-full flex-row items-start gap-3 rounded-2xl border border-white/5 bg-background/40 p-4 lg:flex-col lg:gap-0 lg:p-5">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1 lg:mt-3 lg:w-full">
                    {/*
                      ONE chip, not one per breakpoint. Rendering the payload
                      twice and hiding each with a media query is the easy way
                      to do this and it makes a screen reader announce every
                      value in the circuit twice. `flex-wrap` lets the same
                      element sit inline on a phone and drop onto its own line
                      in a narrow desktop column.
                    */}
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-2">
                      <span className="font-mono text-[11px] tabular-nums text-text-muted lg:hidden">
                        {String(n).padStart(2, '0')}
                      </span>
                      <h3 className="font-display text-sm font-semibold sm:text-base">{name}</h3>
                      {/* `lg:basis-full` forces the chip onto its own line in
                          the desktop column REGARDLESS of the heading's length.
                          Without it a short heading like "You estimate" kept
                          its chip inline while the four longer ones wrapped,
                          so the row of five cards did not line up. */}
                      <span className="ml-auto inline-flex shrink-0 items-center rounded-lg border border-accent/25 bg-accent/10 px-2 py-0.5 font-mono text-[11px] tabular-nums text-accent lg:ml-0 lg:basis-full">
                        {passes}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{what}</p>
                  </div>
                </div>
              </Reveal>

              {/* The forward direction, drawn. Without these the five stations
                  read as five cards that happen to be adjacent; the return arc
                  underneath only makes sense once the outbound path is visible.
                  Decorative: the list is ordered and numbered, so the sequence
                  is already carried by the markup. */}
              {i < STATIONS.length - 1 && (
                <ChevronRight
                  aria-hidden
                  className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-brand/50 lg:block"
                />
              )}
            </li>
          ))}
        </ol>

        {/* The return path. Decorative on its own; the sentence inside it
            carries the meaning, so nothing is lost when the drawing is not
            rendered. */}
        <Reveal className="mt-8">
          <div className="relative">
            <div
              aria-hidden
              className="mx-auto hidden h-10 w-[85%] rounded-b-[2.5rem] border-b border-l border-r border-dashed border-brand/40 lg:block"
            />
            <p className="mt-0 text-center text-sm text-text-primary/90 lg:-mt-1">
              <span className="inline-block rounded-full border border-brand/30 bg-background px-4 py-1.5">
                and that corrects the next estimate you type
              </span>
            </p>
          </div>
        </Reveal>

        <Reveal className="mx-auto mt-12 max-w-2xl text-center">
          <p className="text-base leading-relaxed text-text-muted sm:text-lg">
            A timer in one app cannot fix an estimate living in another. That is the difference
            between a stack of tools and a system, and it is the reason these things share one
            product.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
