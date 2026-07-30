import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, BarChart3, Sprout, Sun, Timer, Wind, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'
import { Reveal } from '../demo/Reveal'
import { SECTION_RHYTHM } from '../sectionRhythm'

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
 * feature. Sleep sounds, guided meditation, the AI coach, the voice journal and
 * image boards are deliberately ABSENT — they are not built, and they are listed
 * with their real blockers on /pricing instead.
 *
 * NO NAMED COMPETITORS AND NO "REPLACES N APPS". The claim is only that these
 * live together; the list is the argument.
 */
const SURFACES: Surface[] = [
  {
    name: 'Plan',
    icon: Sun,
    line: 'Commit to a day that actually fits.',
    items: ['Effort-aware capacity meter', 'Plan my day', 'Week board (Pro)', 'Templates & checklists'],
    to: '/',
    cta: 'Open Today',
  },
  {
    name: 'Focus',
    icon: Timer,
    line: 'Start, and stay started.',
    items: ['Get to work', 'Refresh-proof focus timer', 'Pomodoro 25/5', 'Interruption tally'],
    to: '/work',
    cta: 'Get to work',
  },
  {
    name: 'Habits',
    icon: Sprout,
    line: 'The things you keep doing — and stop doing.',
    items: ['Quit tracker with day zero', 'Supplement & medication log', 'Planning streak', 'Points'],
    to: '/wellness/quit',
    cta: 'Open the quit tracker',
  },
  {
    name: 'Calm',
    icon: Wind,
    line: 'A minute to settle before you start.',
    items: ['Breathwork: Box, 4-7-8, Simple', 'A 60-second reset in Get to work', 'Optional end chime'],
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
            Plan it, focus on it, keep the habits around it, come back down, and see what it
            actually cost. Every one of these is live — open any of them.
          </p>
        </Reveal>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {SURFACES.map(({ icon: Icon, name, line, items, to, cta }, i) => (
            <li key={name}>
              <Reveal delay={i * 60} direction="scale" className="h-full">
                <div className="lift-card flex h-full flex-col rounded-2xl border border-white/5 bg-surface/60 p-5 hover:border-brand/25">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-3 font-display text-base font-semibold">{name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{line}</p>

                  <ul className="mt-3 space-y-1.5">
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

                  <button
                    type="button"
                    onClick={() => open(to)}
                    className="focus-ring mt-auto inline-flex items-center gap-1 rounded-lg pt-4 text-xs font-medium text-accent underline-offset-4 hover:underline"
                  >
                    {cta}
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
