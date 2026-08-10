import { Suspense, lazy, type CSSProperties, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'
import { LivingBackground } from './components/LivingBackground'
import { VortexField } from './components/VortexField'
import { MarketingHeader } from './components/MarketingHeader'
import { MarketingFooter } from './components/MarketingFooter'
import { HeroMeterDemo } from './demo/HeroMeterDemo'
import { LazySection, LazyWidget, Reveal } from './demo/Reveal'
import { useInView } from './demo/useReveal'
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
const WeekBoardDemo = lazy(() =>
  import('./demo/WeekBoardDemo').then((m) => ({ default: m.WeekBoardDemo })),
)

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
const OnePlaceStrip = lazy(() =>
  import('./components/OnePlaceStrip').then((m) => ({ default: m.OnePlaceStrip })),
)
const WellnessTeaser = lazy(() =>
  import('./components/WellnessTeaser').then((m) => ({ default: m.WellnessTeaser })),
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

/**
 * The thread between showcase sections.
 *
 * The features used to read as four unrelated cards stacked down a page. They
 * are one system — capacity feeds the plan, the plan feeds focus, focus feeds
 * the week — and a single drawn line says that faster than a paragraph would.
 * It is `aria-hidden` because it carries no information a screen reader needs;
 * the heading order already expresses the structure.
 */
function SectionThread() {
  const [ref, inView] = useInView<HTMLDivElement>({ rootMargin: '0px 0px -20% 0px', threshold: 0 })
  return (
    <div ref={ref} aria-hidden className="section-thread" data-shown={inView ? 'true' : 'false'} />
  )
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
      {/* The ambient layer. FIRST child and `z-0`, with everything after it at
          `z-10`: a child always paints above its parent's background, so
          `bg-background` above stays the base colour and the aurora sits between
          it and the content. The wrapper's `overflow-x-clip` also means a blob
          can never widen the document. */}
      <LivingBackground />

      <MarketingHeader />

      <main className="relative z-10 flex-1">
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
          {/* The funnel the product is named after. Decorative, motion-gated,
              and positioned to converge on the card. */}
          <VortexField />

          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-10 sm:gap-12 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            {/*
              STAGGERED, NOT ANIMATED-AS-A-BLOCK. Each element arrives on its
              own beat so the eye is led badge -> line -> line -> promise ->
              action, which is the order the page wants to be read in. The
              delays are small and the whole sequence is done in under a
              second: motion that delays comprehension is a bug, not polish.
            */}
            <div>
              <Badge variant="brand" className="hero-rise mb-6">
                <Sparkles className="h-3 w-3" aria-hidden />
                Your daily command center
              </Badge>
              <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                {/* Two block spans rather than a `<br>`: each line can then
                    carry its own delay, and the accessible name is unchanged. */}
                <span className="hero-rise block" style={{ '--rise-delay': '90ms' } as CSSProperties}>
                  Plan a realistic day.
                </span>
                <span
                  className="hero-rise text-gradient-brand block"
                  style={{ '--rise-delay': '210ms' } as CSSProperties}
                >
                  Not a wish-list.
                </span>
              </h1>
              <p
                className="hero-rise mt-6 max-w-md text-base leading-relaxed text-text-muted sm:text-lg"
                style={{ '--rise-delay': '330ms' } as CSSProperties}
              >
                Every task gets a time estimate, so you can see if your day fits before it starts.
              </p>
              <div
                className="hero-rise mt-9 flex flex-col gap-3 sm:flex-row"
                style={{ '--rise-delay': '430ms' } as CSSProperties}
              >
                <Button size="lg" onClick={startFree} className="cta-sheen">
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
                <Link to="/pricing" className="sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    See pricing
                  </Button>
                </Link>
              </div>
              <p
                className="hero-rise mt-4 text-xs text-text-muted"
                style={{ '--rise-delay': '520ms' } as CSSProperties}
              >
                {/* CUSTOMER BENEFIT, NOT IMPLEMENTATION. This used to read
                    "dark, installable PWA" — three pieces of product jargon in
                    a row, on the one line that has to reassure a stranger. What
                    a visitor actually wants to know is whether it costs
                    anything and whether it works on their phone. */}
                Free to start · no credit card · works on your phone and laptop.
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              {/* The card settles in last and from slightly further away, so it
                  reads as the thing the funnel has just resolved into. */}
              <div
                className="hero-rise relative"
                style={{ '--rise-delay': '300ms' } as CSSProperties}
              >
                {/* Breathing halo. Behind the card, blurred, decorative — the
                    card itself is perfectly still so no text ever moves. */}
                <div
                  aria-hidden
                  className="living-halo pointer-events-none absolute -inset-8 rounded-[2.5rem] bg-brand-gradient-soft blur-2xl"
                />
                <div className="relative">
                  <HeroMeterDemo />
                </div>
              </div>
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
              See what actually <span className="text-warning">fits</span> in your day.
            </>
          }
        >
          <LazyWidget component={CapacityDemo} minHeight={360} label="the capacity demo" />
        </Showcase>

        <SectionThread />

        <Showcase
          eyebrow="Auto-plan"
          flip
          line={
            <>
              One tap. A day that{' '}
              <span className="text-gradient-brand">actually fits</span>.
            </>
          }
        >
          <LazyWidget component={AutoPlanDemo} minHeight={640} label="the auto-plan demo" />
        </Showcase>

        <SectionThread />

        <Showcase
          eyebrow="Focus"
          line={
            <>
              Then <span className="text-success">protect your focus</span>.
            </>
          }
        >
          <LazyWidget component={FocusDemo} minHeight={450} label="the focus demo" />
        </Showcase>

        <SectionThread />

        {/* Week planning is the flagship paid feature and was invisible to anyone
            who hadn't signed up. This runs the REAL planWeek, same as the app. */}
        <Showcase
          eyebrow="The week"
          flip
          line={
            <>
              Seven days that <span className="text-gradient-brand">all fit</span>.
            </>
          }
        >
          <LazyWidget component={WeekBoardDemo} minHeight={420} label="the week board demo" />
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

        {/* 3b. The breadth, stated as a fact and linked to the real surfaces. */}
        <LazySection minHeight={560}>
          <Suspense fallback={null}>
            <OnePlaceStrip />
          </Suspense>
        </LazySection>

        {/* Focus & Calm: two shipped modules link into the app; the two that
            aren't usable yet keep the insert-only feature_intents fake door. */}
        <LazySection minHeight={560}>
          <Suspense fallback={null}>
            <WellnessTeaser />
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
                  Commit to what fits, focus on it, and pick up whatever slips.
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <Button size="lg" onClick={startFree} className="cta-sheen">
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

      <div className="relative z-10">
        <MarketingFooter />
      </div>
    </div>
  )
}
