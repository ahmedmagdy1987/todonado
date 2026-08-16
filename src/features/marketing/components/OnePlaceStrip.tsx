import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, BarChart3, Sprout, Sun, Timer, Wind, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'
import { Reveal } from '../demo/Reveal'
import { ALL_IN_ONE_CATEGORIES } from '../plans'
import { SECTION_RHYTHM } from '../sectionRhythm'
import { EverythingStrip } from './EverythingStrip'

interface Surface {
  /** The group's name — one word, because the items underneath do the talking. */
  name: string
  icon: LucideIcon
  line: string
  /** Real, shipped surfaces. Nothing aspirational may appear here. */
  items: string[]
  /** The real route this group opens. */
  to: string
  cta: string
}

/**
 * "One place for your day" — the breadth of the product, stated as a fact.
 *
 * WHAT THIS SECTION MAY CONTAIN: surfaces a signed-up user can open right now.
 * Every `to` below is a live route and every string in `items` is a shipped
 * feature. Sleep sounds and guided meditation are deliberately ABSENT: they are
 * not built, and they are listed with their real blocker on /pricing instead.
 * (Anything needing a paid model provider is cancelled outright, CLAUDE.md §5,
 * so it appears on no page at all rather than on a not-built list.)
 *
 * NO NAMED COMPETITORS AND NO "REPLACES N APPS". The claim is only that these
 * live together; the list is the argument.
 */
/**
 * The all-in-one claim, in category terms.
 *
 * THE BAR FOR THIS LIST IS THE SAME AS EVERYWHERE ELSE ON THE LANDING: not "the
 * code is merged" but "a stranger who signs up right now can use it". The
 * journal and the mind-map canvas waited out here while their migrations were
 * pending; both are applied and live-verified now, so both are claimable.
 *
 * NO BRAND NAMES AND NO "REPLACES N APPS" — a number invites arithmetic nobody
 * wins, and naming competitors makes the page about them. The list is the claim.
 * `e2e/marketing.spec.ts` enforces both, and enforces that every category here
 * is one a signed-up user can actually open.
 */
// ONE array, shared with the pricing page. The two lists had drifted to six
// entries here and four there while both files carried a comment insisting they
// were identical. See ALL_IN_ONE_CATEGORIES in plans.ts.
const CATEGORIES = ALL_IN_ONE_CATEGORIES

const SURFACES: Surface[] = [
  {
    name: 'Plan',
    icon: Sun,
    line: 'Commit to a day that actually fits.',
    items: ['A capacity meter that counts minutes', 'Plan my day', 'Week board (Pro)', 'Templates & checklists'],
    to: '/',
    cta: 'Open Today',
  },
  {
    name: 'Focus',
    icon: Timer,
    line: 'Start, and stay started.',
    items: [
      'Get to work',
      'A timer that keeps going if you close the page',
      'Pomodoro: 25 minutes on, 5 off',
      'Count your interruptions',
    ],
    to: '/work',
    cta: 'Get to work',
  },
  {
    name: 'Habits',
    icon: Sprout,
    line: 'The things you keep doing, and the ones you stop.',
    items: [
      'Quit tracker with a clean streak',
      'Supplement & medication log',
      'Planning streak',
      'Points',
    ],
    to: '/wellness/quit',
    cta: 'Open the quit tracker',
  },
  {
    name: 'Calm',
    icon: Wind,
    line: 'A minute to settle before you start.',
    items: [
      'Breathwork: Box, 4-7-8, Simple',
      // Safe to claim: white, pink and brown are generated on the device, so
      // this is the one audio line on the page that waits on nothing. The
      // recorded ambience stays off every marketing surface until it is licensed.
      'Sleep noise with a sleep timer',
      'A 60-second reset in Get to work',
      'Optional end chime',
    ],
    to: '/wellness/breathe',
    cta: 'Try breathwork',
  },
  {
    name: 'Reflect',
    icon: BarChart3,
    line: 'What the week actually cost, and why.',
    items: ['Insights: planned vs actual (Pro)', 'Estimation accuracy (Pro)', 'Vision goals', 'Share cards'],
    to: '/vision',
    cta: 'Open Vision',
  },
]

export function OnePlaceStrip() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  /**
   * Signed in → straight to the surface. Logged out → signup, carrying the
   * destination in `from` so they land THERE after signing up rather than on
   * Today. Same mechanism ProtectedRoute and the wellness teaser use.
   */
  function open(to: string) {
    if (session) {
      navigate(to)
      return
    }
    navigate('/login', {
      state: { ...((location.state as object | null) ?? {}), mode: 'signup', from: { pathname: to } },
    })
  }

  return (
    // Background removed: the enclosing chapter's scene provides it.
    <section aria-labelledby="one-place">
      <div className={cn(SECTION_RHYTHM, 'max-w-6xl')}>
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 id="one-place" className="font-display text-2xl font-bold sm:text-3xl">
            One place for your day
          </h2>
          <p className="mt-3 text-text-muted">
            Plan it, focus on it, build the habits around it, wind down, and see where the time
            actually went. Every one of these is live. Open any of them.
          </p>

          {/* The all-in-one claim, as CATEGORIES. No brand names and no
              "replaces N apps": a number invites arithmetic nobody wins, and
              naming competitors makes the page about them. The list is the
              claim, and every entry on it is something a stranger who signs up
              right now can open. The journal and the mind-map canvas joined the
              list in 47b795f, when their migrations were applied and the
              "not switched on yet" page stopped being what a new account met.
              The bar is what a visitor can DO, not whether the code is
              merged. */}
          <p className="mt-5 text-sm font-medium text-text-primary">One app instead of several</p>
          <ul className="mt-2.5 flex flex-wrap justify-center gap-1.5 sm:gap-2">
            {CATEGORIES.map((c) => (
              <li
                key={c}
                className="rounded-full border border-white/10 bg-surface-2/50 px-3 py-1 text-xs text-text-muted"
              >
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-text-muted/80">
            Same account, same plan, same data. None of them is a separate subscription.
          </p>
        </Reveal>

        {/*
          ONE ELEGANT REPRESENTATION, NOT A FIFTH CARD GRID.

          This was five bordered cards, each with a bulleted list and a link,
          and it was the tallest block on the page: 1,864px on a phone, most of
          three screens, to say "these five things live together". Card chrome
          was doing none of the work. The border, the fill, the hover lift and
          the internal padding existed only to separate five items that a
          hairline already separates.

          It is now five RULED ROWS. Every group, every shipped item and every
          real destination survives; the bullets become one muted run of text
          per row, which is how you would actually say it out loud. On a phone a
          row is about 90px instead of about 260px.

          Deliberately NOT a bento grid. A bento would be another decorative
          container system on a page that has just spent four chapters removing
          them, and it would make the five groups look like five products rather
          than five parts of one.
        */}
        <ul className="mx-auto mt-8 max-w-4xl border-t border-white/5 sm:mt-10">
          {SURFACES.map(({ icon: Icon, name, line, items, to, cta }, i) => (
            <li key={name} className="border-b border-white/5">
              <Reveal delay={Math.min(i, 5) * 50}>
                <div className="flex items-start gap-3 py-4 sm:gap-4 sm:py-5">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className="font-display text-base font-semibold">{name}</h3>
                      <p className="text-xs text-text-muted sm:text-sm">{line}</p>
                    </div>

                    {/* The items, as one line rather than four bullets. Still a
                        list in the markup, so a screen reader still hears four
                        distinct things and the count is not lost. */}
                    <ul className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-text-muted/90">
                      {items.map((item, n) => (
                        <li key={item}>
                          {item}
                          {n < items.length - 1 && (
                            <span aria-hidden className="ml-2 text-white/15">
                              &middot;
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* `min-h-[44px]`: this was 28px tall before, under the touch
                      floor the rest of the app holds itself to. The landing was
                      never covered by the ergonomics sweep because that suite
                      signs in first, so nothing had ever measured it. */}
                  <button
                    type="button"
                    onClick={() => open(to)}
                    className="focus-ring inline-flex min-h-[44px] shrink-0 items-center gap-1 self-center rounded-lg text-xs font-medium text-accent underline-offset-4 hover:underline"
                  >
                    <span className="hidden sm:inline">{cta}</span>
                    <span className="sr-only sm:hidden">{cta}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>

        {/* The flat "and also…" list, absorbed from what used to be its own
            band immediately below this one. Two breadth sections in a row was
            the same argument twice, and the grouped one is the stronger of the
            two, so that is the one the reader is left holding. */}
        <EverythingStrip />
      </div>
    </section>
  )
}
