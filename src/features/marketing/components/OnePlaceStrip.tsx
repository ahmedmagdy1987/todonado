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
    <section className="border-y border-white/5 bg-surface/20" aria-labelledby="one-place">
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
          <p className="mt-6 text-sm font-medium text-text-primary">One app instead of several</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
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
          Tightened rather than reduced.

          This section now sits directly after the loop, so two consecutive
          screens were making a breadth argument and the second one was three
          full phone-screens of scrolling. Nothing was removed: every group,
          every shipped item and every real destination is still here, and the
          e2e guard still finds all five headings and all five buttons. The
          padding, the icon and the bullet rhythm are simply smaller on a phone,
          where a five-card column is the whole cost.
        */}
        {/* Two across on a phone, like every other card grid on the page. Five
            full-width cards made this the tallest block on the landing once the
            "everything else" list moved inside it. */}
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
          {SURFACES.map(({ icon: Icon, name, line, items, to, cta }, i) => (
            <li key={name}>
              <Reveal delay={i * 60} direction="scale" className="h-full">
                <div className="lift-card flex h-full flex-col rounded-2xl border border-white/5 bg-surface/60 p-4 hover:border-brand/25 sm:p-5">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand sm:h-10 sm:w-10">
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                    </span>
                    <h3 className="font-display text-base font-semibold">{name}</h3>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-text-muted">{line}</p>

                  <ul className="mt-2.5 space-y-1">
                    {items.map((item) => (
                      <li key={item} className="flex items-start gap-1.5 text-xs text-text-muted">
                        <span
                          aria-hidden
                          className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>

                  {/* `min-h-[44px]`: these five were 28px tall, which is under
                      the touch floor the rest of the app holds itself to. The
                      landing was never covered by the ergonomics sweep because
                      that suite signs in first, so nothing had ever measured
                      them. The label is unchanged; only the box grew. */}
                  <button
                    type="button"
                    onClick={() => open(to)}
                    className="focus-ring mt-auto inline-flex min-h-[44px] items-center gap-1 self-start rounded-lg pt-3 text-xs font-medium text-accent underline-offset-4 hover:underline"
                  >
                    {cta}
                    <ArrowRight className="h-3 w-3" aria-hidden />
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
