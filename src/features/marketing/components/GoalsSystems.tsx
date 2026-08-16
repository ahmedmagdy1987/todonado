import { ArrowRight, Compass, ListTree, CalendarClock, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Reveal } from '../demo/Reveal'
import { SECTION_RHYTHM } from '../sectionRhythm'

/**
 * THE ONE ATTRIBUTED QUOTATION ON THE PAGE.
 *
 * ── WHY IT SURVIVED AND OTHERS DID NOT ─────────────────────────────────────
 *
 * The rule applied to every candidate quotation was: a primary source, exact
 * wording, verified attribution, or it does not ship as a quote. This one
 * clears that bar by the widest margin available.
 *
 *   Wording   verbatim in the published book, twice in the same chapter (the
 *             running prose and the chapter summary), confirmed against the
 *             publisher-digitized full text rather than any aggregator
 *   Source    James Clear, "Atomic Habits" (Avery/Penguin Random House, 2018),
 *             chapter 1, "The Surprising Power of Atomic Habits"
 *   Author    jamesclear.com's own quote database sources both lines to the
 *             book, not to a tweet or newsletter
 *
 * The attribution rendered below names the BOOK AND CHAPTER and deliberately
 * omits a page number: pagination varies by edition, and a citation that is
 * wrong in paperback is worse than one that is merely less precise.
 *
 * Quote-aggregator sites were treated as evidence of nothing throughout. They
 * are how the two rejected candidates (see docs/HOMEPAGE_V2_CLAIMS.md) came to
 * be believed in the first place.
 *
 * ── WHY A QUOTE AT ALL ─────────────────────────────────────────────────────
 *
 * Because the sentence after it is the product. The quotation is not decoration
 * or borrowed authority: it states the exact distinction the next three steps
 * implement, and the section would still make sense with it removed, which is
 * the test a pull quote has to pass.
 */

interface Step {
  icon: LucideIcon
  where: string
  title: string
  body: string
}

/** Three real surfaces, in the order a goal actually travels through them. */
const STEPS: Step[] = [
  {
    icon: Compass,
    where: 'Vision',
    title: 'Write down what it is for',
    body: 'The goal, and the reason underneath it. One place that is not a task list, so a goal is never just an old unchecked box.',
  },
  {
    icon: ListTree,
    where: 'Projects',
    title: 'Break it into real work',
    body: 'Sections, tasks and subtasks, each carrying the minutes it will honestly take.',
  },
  {
    icon: CalendarClock,
    where: 'Today and the week',
    title: 'Give it a time',
    body: 'Work that is scheduled competes for the same hours as everything else, which is the only test that matters.',
  },
]

export function GoalsSystems() {
  return (
    <section className={cn(SECTION_RHYTHM, 'max-w-6xl')} aria-labelledby="goals-systems">
      <Reveal className="mx-auto max-w-3xl text-center">
        {/* A REAL h2, even though it looks like an eyebrow.
            The section's `aria-labelledby` used to point at the quotation
            itself, which is valid ARIA and still left this section as the only
            one on the page missing from the heading outline. A quotation is not
            a heading; the label above it is. */}
        <h2 id="goals-systems" className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          Goals and systems
        </h2>

        <figure className="mt-6 sm:mt-8">
          <blockquote>
            <p className="font-display text-2xl font-bold leading-[1.25] tracking-tight sm:text-3xl lg:text-4xl">
              &ldquo;You do not rise to the level of your goals. You fall to the level of your
              systems.&rdquo;
            </p>
          </blockquote>
          <figcaption className="mt-5 text-sm text-text-muted">
            James Clear,{' '}
            <cite className="not-italic font-medium text-text-primary/80">Atomic Habits</cite>{' '}
            (2018), chapter 1
          </figcaption>
        </figure>

        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-text-muted sm:mt-10 sm:text-lg">
          A goal is a direction. A system is what you actually do on a Tuesday. Todonado is where
          the first turns into the second, because an intention with no hour attached to it is still
          just an intention.
        </p>
      </Reveal>

      {/* Same two-shape rule as the loop: a row per step on a phone, three
          columns from `md`. One list, one order, one set of markup. */}
      <ol className="mt-8 grid gap-2.5 sm:gap-3 md:mt-14 md:grid-cols-3 md:gap-4">
        {STEPS.map(({ icon: Icon, where, title, body }, i) => (
          <li key={where} className="relative">
            <Reveal delay={i * 80} direction="scale" className="h-full">
              <div className="flex h-full flex-row items-start gap-3 rounded-2xl border border-white/5 bg-surface/50 p-4 md:flex-col md:gap-0 md:p-5">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 md:mt-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
                    {where}
                  </span>
                  <h3 className="mt-1 font-display text-sm font-semibold sm:text-base md:mt-2">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{body}</p>
                </div>
              </div>
            </Reveal>

            {/* The connector, desktop only. Decorative: the list is ordered, so
                the sequence is already in the markup. */}
            {i < STEPS.length - 1 && (
              <ArrowRight
                aria-hidden
                className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-brand/40 md:block"
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
