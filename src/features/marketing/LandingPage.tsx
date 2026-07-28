import { Suspense, lazy, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'
import { MarketingHeader } from './components/MarketingHeader'
import { MarketingFooter } from './components/MarketingFooter'
import { HeroMeterDemo } from './demo/HeroMeterDemo'
import { LazySection, LazyWidget, Reveal } from './demo/Reveal'
import { SECTION_RHYTHM } from './sectionRhythm'

/**
 * The three below-the-fold demos are code-split and mounted only as they near
 * the viewport, so the landing chunk stays lean and the hero — which IS
 * interactive on first paint — never competes with them for bandwidth.
 */
const CapacityDemo = lazy(() =>
  import('./demo/CapacityDemo').then((m) => ({ default: m.CapacityDemo })),
)
const AutoPlanDemo = lazy(() =>
  import('./demo/AutoPlanDemo').then((m) => ({ default: m.AutoPlanDemo })),
)
const FocusDemo = lazy(() => import('./demo/FocusDemo').then((m) => ({ default: m.FocusDemo })))

/**
 * Everything below the hero is deferred the same way — the first paint ships
 * the hero and its live meter, nothing else.
 */
const HowItWorks = lazy(() =>
  import('./components/HowItWorks').then((m) => ({ default: m.HowItWorks })),
)
const EverythingStrip = lazy(() =>
  import('./components/EverythingStrip').then((m) => ({ default: m.EverythingStrip })),
)
const LandingFaq = lazy(() =>
  import('./components/LandingFaq').then((m) => ({ default: m.LandingFaq })),
)
const PricingTeaser = lazy(() =>
  import('./components/PricingTeaser').then((m) => ({ default: m.PricingTeaser })),
)

interface ShowcaseProps {
  eyebrow: string
  line: ReactNode
  children: ReactNode
  /** Put the widget on the left at desktop widths (alternating rhythm). */
  flip?: boolean
}

/** One short line, one live widget. No paragraphs — the widget is the argument. */
function Showcase({ eyebrow, line, children, flip = false }: ShowcaseProps) {
  return (
    <section className={cn(SECTION_RHYTHM, 'max-w-6xl')}>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal direction={flip ? 'right' : 'left'} className={cn(flip && 'lg:order-2')}>
          {/* Accent blue, not brand violet: #6C5CE7 on the near-black background
              is 4.14:1 — under the 4.5:1 needed at this size. #4EA8FF is 7.9:1. */}
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
          <h2 className="mt-4 font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
            {line}
          </h2>
        </Reveal>
        <Reveal direction="scale" delay={80} className={cn(flip && 'lg:order-1')}>
          {children}
        </Reveal>
      </div>
    </section>
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

  const ctaLabel = session ? 'Open your command center' : 'Start free'

  return (
    // `overflow-x-clip` (NOT `overflow-x-hidden`): the reveal animations park
    // elements 24px off-axis before they fire, which pushed the 390px viewport
    // to 398px wide. `clip` contains that without creating a scroll container,
    // so the sticky marketing header keeps working.
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-text-primary">
      <MarketingHeader />

      <main className="flex-1">
        {/* ---------------------------------------------------------------- */}
        {/* 1. HERO — the signature meter, live and moving, above the fold.  */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative flex min-h-[calc(100svh_-_4rem)] flex-col justify-center overflow-hidden">
          {/* Ambient brand glow. Decorative, GPU-composited, motion-gated. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] animate-glow-drift"
            style={{
              background:
                'radial-gradient(55% 55% at 50% 0%, rgba(108,92,231,0.22) 0%, rgba(78,168,255,0.08) 38%, transparent 72%)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.4]"
            style={{
              background:
                'radial-gradient(40% 40% at 85% 60%, rgba(78,168,255,0.10) 0%, transparent 70%)',
            }}
          />

          {/* Tight vertical rhythm on mobile so the live meter — the signature —
              still clears the fold on a 390x844 phone. */}
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-10 sm:gap-12 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div className="animate-fade-in">
              <Badge variant="brand" className="mb-6">
                <Sparkles className="h-3 w-3" aria-hidden />
                Your daily command center
              </Badge>
              <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Plan a realistic day.
                <br />
                <span className="text-gradient-brand">Not a wish-list.</span>
              </h1>
              <p className="mt-6 max-w-md text-base leading-relaxed text-text-muted sm:text-lg">
                Every task carries the minutes it costs. The meter tells you the truth before the
                day does.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={startFree}>
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
                <Link to="/pricing" className="sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    See pricing
                  </Button>
                </Link>
              </div>
              <p className="mt-4 text-xs text-text-muted">
                Free to start · no credit card · dark, installable PWA.
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <HeroMeterDemo />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 2. Three scroll sections — one line, one live widget each.       */}
        {/* ---------------------------------------------------------------- */}
        <Showcase
          eyebrow="Capacity"
          line={
            <>
              Fill a day until it{' '}
              <span className="text-warning">stops fitting</span>.
            </>
          }
        >
          <LazyWidget component={CapacityDemo} minHeight={360} label="the capacity demo" />
        </Showcase>

        <Showcase
          eyebrow="Auto-plan"
          flip
          line={
            <>
              One press. A day that{' '}
              <span className="text-gradient-brand">actually fits</span>.
            </>
          }
        >
          <LazyWidget component={AutoPlanDemo} minHeight={640} label="the auto-plan demo" />
        </Showcase>

        <Showcase
          eyebrow="Focus"
          line={
            <>
              Then <span className="text-success">protect it</span>.
            </>
          }
        >
          <LazyWidget component={FocusDemo} minHeight={450} label="the focus demo" />
        </Showcase>

        {/* Real product screenshots — no mockups. */}
        <LazySection minHeight={1400}>
          <Suspense fallback={null}>
            <HowItWorks />
          </Suspense>
        </LazySection>

        {/* 3. Everything-else strip. */}
        <LazySection minHeight={520}>
          <Suspense fallback={null}>
            <EverythingStrip />
          </Suspense>
        </LazySection>

        {/* Honest answers. */}
        <LazySection minHeight={640}>
          <Suspense fallback={null}>
            <LandingFaq />
          </Suspense>
        </LazySection>

        {/* 4. Pricing teaser + final CTA. */}
        <LazySection minHeight={760}>
          <Suspense fallback={null}>
            <PricingTeaser onStartFree={startFree} ctaLabel={ctaLabel} />
          </Suspense>
        </LazySection>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-surface px-6 py-16 text-center shadow-elevation-lg">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'radial-gradient(60% 80% at 50% 0%, rgba(108,92,231,0.20) 0%, transparent 70%)',
                }}
              />
              <div className="relative">
                <h2 className="font-display text-2xl font-bold sm:text-4xl">
                  Stop planning days that don&rsquo;t fit.
                </h2>
                <p className="mx-auto mt-4 max-w-md text-text-muted">
                  Commit to what&rsquo;s realistic, execute with focus, recover without guilt.
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <Button size="lg" onClick={startFree}>
                    {ctaLabel}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                  <Link to="/pricing">
                    <Button size="lg" variant="outline" className="w-full sm:w-auto">
                      Compare plans
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <MarketingFooter />
    </div>
  )
}
