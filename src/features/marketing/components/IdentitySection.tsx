import { Flame, History, Sprout, Timer, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Reveal } from '../demo/Reveal'
import { usePrefersReducedMotion } from '../demo/useReveal'
import { SECTION_RHYTHM } from '../sectionRhythm'

/**
 * IDENTITY, KEPT HONEST.
 *
 * The owner's idea for this section is "become the person you say you want to
 * become", and it is a good one. It is also one word away from the genre this
 * page must not join, so the line the section refuses to cross is written down
 * here rather than left to taste:
 *
 *   ALLOWED   what the software actually records, and what a record is for
 *   REFUSED   outcomes the software cannot produce
 *
 * So there is nothing here about being in the top 1%, about discipline as a
 * personality, or about what a consistent month will do for your income, your
 * body or your happiness. Todonado cannot deliver any of that and saying so
 * would make every honest claim on the page cheaper.
 *
 * What it CAN do is keep count. Four real, shipped surfaces do the arguing:
 * the planning streak, recorded focus time, completed history, and the quit
 * tracker's clean streak. Each of those is a fact the app already holds about
 * work you already did, which is a much smaller promise and a true one.
 *
 * ── THE ROTATING LINE ──────────────────────────────────────────────────────
 *
 * Every phrase names a behaviour the product supports directly, so the
 * motivational line and the feature list are the same list. A rotation of
 * adjectives would be decoration; this one is an index.
 *
 * All four phrases are in the DOM in both branches, so nothing depends on the
 * animation running. Under `prefers-reduced-motion` they render as one static
 * line at a smaller size rather than four stacked display headings, which is
 * the same "jump to the end state" rule the other landing widgets follow.
 */

const BEHAVIOURS = [
  'plans their day',
  'protects their focus',
  'finishes what they start',
  'shows up on the bad days',
] as const

interface Evidence {
  icon: LucideIcon
  label: string
  what: string
}

/** Four things the app genuinely keeps count of. Nothing aspirational. */
const EVIDENCE: Evidence[] = [
  {
    icon: Flame,
    label: 'Planning streak',
    what: 'The run of days you actually sat down and planned.',
  },
  {
    icon: Timer,
    label: 'Focus time',
    what: 'Real recorded minutes, per task, not a guess after the fact.',
  },
  {
    icon: History,
    label: 'Completed history',
    what: 'Everything you finished, kept with the day you finished it.',
  },
  {
    icon: Sprout,
    label: 'Clean streak',
    what: 'Days since you stopped, counted from a timestamp so it never resets by accident.',
  },
]

export function IdentitySection() {
  const reduced = usePrefersReducedMotion()

  return (
    <section className={cn(SECTION_RHYTHM, 'max-w-6xl')} aria-labelledby="identity">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Proof, not promises</p>

        <h2
          id="identity"
          className="mt-3 font-display text-2xl font-bold leading-[1.15] tracking-tight md:text-3xl lg:mt-4 lg:text-5xl lg:leading-[1.1]"
        >
          Become the person who
          {reduced ? (
            // Static, smaller, and complete. Four display-size lines stacked
            // would double the section's height for the one visitor who asked
            // for less movement, not more page.
            <span className="mt-3 block text-xl font-semibold text-gradient-brand sm:text-2xl">
              {BEHAVIOURS.join(' · ')}
            </span>
          ) : (
            <span className="identity-cycle mt-2 block text-gradient-brand">
              {BEHAVIOURS.map((phrase, i) => (
                <span
                  key={phrase}
                  className="identity-cycle__word"
                  style={{
                    // One shared cycle, evenly divided. Each phrase holds for
                    // about two and a half seconds, which is reading speed
                    // rather than slideshow speed.
                    animationDelay: `${(i * 10) / BEHAVIOURS.length}s`,
                  }}
                >
                  {phrase}
                </span>
              ))}
            </span>
          )}
        </h2>

        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-text-muted sm:mt-6 sm:text-lg">
          Not because you decided to be. Because there is a record of it, and the record is made of
          days you already lived.
        </p>
      </Reveal>

      {/* Two across on a phone: four single-column cards for four short facts
          was most of a screen of scrolling to say "the app keeps count". */}
      <ul className="mt-8 grid grid-cols-2 gap-3 sm:mt-12 sm:gap-4 lg:mt-14 lg:grid-cols-4">
        {EVIDENCE.map(({ icon: Icon, label, what }, i) => (
          <li key={label}>
            <Reveal delay={i * 70} direction="scale" className="h-full">
              <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-surface/50 p-4 sm:p-5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand sm:h-10 sm:w-10">
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                </span>
                <h3 className="mt-3 font-display text-sm font-semibold sm:text-base">{label}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{what}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>

      <Reveal className="mx-auto mt-8 max-w-2xl text-center">
        <p className="text-sm leading-relaxed text-text-primary/90 sm:text-base">
          Streaks here are counted gently and never used against you. A missed day is a missed day,
          not a verdict, and nothing you have already done is ever taken away to punish it.
        </p>
      </Reveal>
    </section>
  )
}
