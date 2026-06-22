import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CalendarClock,
  Gauge,
  ListChecks,
  RotateCcw,
  Sparkles,
  Target,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { FocusCalmCards } from '@/features/wellness/components/FocusCalmCards'
import { MarketingHeader } from './components/MarketingHeader'
import { MarketingFooter } from './components/MarketingFooter'

interface Feature {
  icon: LucideIcon
  title: string
  body: string
  soon?: boolean
}

const FEATURES: Feature[] = [
  {
    icon: Gauge,
    title: 'Effort-aware capacity meter',
    body: 'Tag each task with the minutes it takes. A live meter sums your day against your real capacity and warns before you overcommit.',
  },
  {
    icon: RotateCcw,
    title: 'Roll-over & recovery',
    body: "Didn't finish? Unfinished work surfaces for a calm, one-tap roll-over. No guilt pile, no silent backlog.",
  },
  {
    icon: Timer,
    title: 'Focus mode',
    body: 'A distraction-free, refresh-proof deep-work timer bound to the task at hand. One thing at a time.',
  },
  {
    icon: CalendarClock,
    title: 'Recurring tasks',
    body: 'Daily, weekly, monthly, or yearly cadences with smart next-occurrence dates. Set it once.',
  },
  {
    icon: ListChecks,
    title: 'Capture & organize',
    body: 'Frictionless capture into the Inbox, then projects, sections, and subtasks when you need structure.',
  },
  {
    icon: Target,
    title: 'Insights: planned vs actual',
    body: 'See where your estimates drift from reality and plan a more honest day over time.',
    soon: true,
  },
]

/** Static hero visual: a mock of the effort-aware capacity meter. */
function CapacityMock() {
  return (
    <Card className="w-full max-w-sm shadow-elevation-lg">
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-brand" aria-hidden />
          <span className="font-display text-sm font-semibold">Day Capacity</span>
          <Badge variant="brand" className="ml-1">
            Effort-aware
          </Badge>
          <span className="ml-auto font-mono text-xs text-warning">92% planned</span>
        </div>
        <div
          className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
          role="img"
          aria-label="Capacity meter at 92 percent"
        >
          <div className="h-full rounded-full bg-warning" style={{ width: '92%' }} />
        </div>
        <div className="flex items-center justify-between font-mono text-sm">
          <span className="text-text-primary">
            5h 30m <span className="text-text-muted">planned</span>
          </span>
          <span className="text-text-muted">30m free</span>
        </div>
        <p className="text-xs text-text-muted">
          Nearly full. Protect your focus and add only what truly matters.
        </p>
      </CardContent>
    </Card>
  )
}

export function LandingPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const startFree = () =>
    session
      ? navigate('/')
      : navigate('/login', {
          state: { ...((location.state as object | null) ?? {}), mode: 'signup' },
        })

  return (
    <div className="flex min-h-screen flex-col bg-background text-text-primary">
      <MarketingHeader />

      <main className="flex-1">
        {/* Hero: fills the first viewport (minus the sticky h-16 header) on load.
            min-height (svh) so short screens grow + scroll instead of clipping. */}
        <section className="relative flex min-h-[calc(100svh_-_4rem)] flex-col justify-center overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(60% 50% at 50% 0%, rgba(108,92,231,0.18) 0%, rgba(78,168,255,0.07) 35%, transparent 70%)',
            }}
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2">
            <div className="animate-fade-in">
              <Badge variant="brand" className="mb-5">
                <Sparkles className="h-3 w-3" aria-hidden />
                Your daily command center
              </Badge>
              <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                Plan a realistic day.
                <br />
                <span className="text-gradient-brand">Not a wish-list.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base text-text-muted sm:text-lg">
                Todonado knows your time is finite. Tag each task with the effort it takes, and a
                live capacity meter shows what actually fits, so you commit to a day you can
                finish, and recover gracefully when plans slip.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={startFree}>
                  {session ? 'Open your command center' : 'Start free'}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
                <Link to="/pricing">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    See pricing
                  </Button>
                </Link>
              </div>
              <p className="mt-3 text-xs text-text-muted">
                Free to start · no credit card · dark, installable PWA.
              </p>
            </div>
            <div className="flex justify-center lg:justify-end">
              <CapacityMock />
            </div>
          </div>
        </section>

        {/* The difference: before / after */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">
              A to-do list hoards tasks. Todonado makes the day honest.
            </h2>
            <p className="mt-3 text-text-muted">
              The difference is one idea done well: <strong>effort-aware planning</strong>.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Card className="border-danger/20">
              <CardContent className="space-y-3">
                <Badge variant="danger">Every other to-do app</Badge>
                <p className="text-sm text-text-muted">
                  A bottomless list. You schedule twelve things into an eight-hour day and only
                  discover at 6pm that you never had a chance. Then everything rolls into an
                  ever-growing pile of guilt.
                </p>
              </CardContent>
            </Card>
            <Card className="ring-1 ring-brand/30">
              <CardContent className="space-y-3">
                <Badge variant="brand">With Todonado</Badge>
                <p className="text-sm text-text-primary/90">
                  Every task carries an estimate. The meter fills as you plan. Cross your capacity
                  and Todonado flags it, then suggests the smallest set of tasks to move to
                  tomorrow. You commit to a day that fits.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Who it's for */}
        <section className="border-y border-white/5 bg-surface/40">
          <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">Built for over-committers</h2>
            <p className="mt-4 text-text-muted">
              Solo knowledge workers, founders, freelancers, and grad students who lose the day to
              an ever-growing list. You don&rsquo;t need another place to hoard tasks. You need a
              way to decide what fits <em>today</em> and protect that decision.
            </p>
          </div>
        </section>

        {/* Feature grid */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center font-display text-2xl font-bold sm:text-3xl">
            Everything you need to run an honest day
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body, soon }) => (
              <Card key={title}>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    {soon && <Badge variant="outline">Soon</Badge>}
                  </div>
                  <h3 className="font-display text-base font-semibold">{title}</h3>
                  <p className="text-sm text-text-muted">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Focus & Calm — wellness fake-door teaser (signal only; nothing here is built) */}
        <section className="border-y border-white/5 bg-surface/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="outline" className="mb-4">
                Exploring
              </Badge>
              <h2 className="font-display text-2xl font-bold sm:text-3xl">
                A calmer side to your day
              </h2>
              <p className="mt-3 text-text-muted">
                We&rsquo;re weighing a wellness companion to Todonado. None of these are built yet —
                tell us what you&rsquo;d actually use and we&rsquo;ll let you know if we ship it.
              </p>
            </div>
            <div className="mt-10">
              <FocusCalmCards source="landing" />
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <Card className="overflow-hidden">
            <CardContent className="flex flex-col items-center gap-5 py-12 text-center">
              <h2 className="font-display text-2xl font-bold sm:text-3xl">
                Stop planning days that don&rsquo;t fit.
              </h2>
              <p className="max-w-xl text-text-muted">
                Capture everything, plan what&rsquo;s realistic, execute with focus, and recover
                intelligently. Start free today.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={startFree}>
                  {session ? 'Open your command center' : 'Start free'}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
                <Link to="/pricing">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    Compare plans
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <MarketingFooter />
    </div>
  )
}
