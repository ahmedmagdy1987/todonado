import { Suspense, lazy, type CSSProperties, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
const RecoveryDemo = lazy(() =>
  import('./demo/RecoveryDemo').then((m) => ({ default: m.RecoveryDemo })),
)
const WeekBoardDemo = lazy(() =>
  import('./demo/WeekBoardDemo').then((m) => ({ default: m.WeekBoardDemo })),
)

/**
 * Everything below the hero is deferred the same way — the first paint ships
 * the hero and its live meter, nothing else.
 */
const ProblemSection = lazy(() =>
  import('./components/ProblemSection').then((m) => ({ default: m.ProblemSection })),
)
const GoalsSystems = lazy(() =>
  import('./components/GoalsSystems').then((m) => ({ default: m.GoalsSystems })),
)
const SystemLoop = lazy(() =>
  import('./components/SystemLoop').then((m) => ({ default: m.SystemLoop })),
)
const IdentitySection = lazy(() =>
  import('./components/IdentitySection').then((m) => ({ default: m.IdentitySection })),
)
const ResearchMoment = lazy(() =>
  import('./components/ResearchMoment').then((m) => ({ default: m.ResearchMoment })),
)
const HowItWorks = lazy(() =>
  import('./components/HowItWorks').then((m) => ({ default: m.HowItWorks })),
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
  /**
   * Headline centred ABOVE a full-width widget, instead of beside it.
   *
   * Two reasons, both visible only at desktop widths. The proof widgets ran
   * five in a row in the same split composition, and by the fifth the layout
   * had stopped being a rhythm and become a pattern. And the week board is the
   * one widget that is genuinely wide — seven day columns — so half a container
   * left it small next to 600px of empty space, which is the worst of both:
   * a void beside a shrunken version of the flagship paid feature.
   */
  full?: boolean
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
function Showcase({ eyebrow, line, children, flip = false, full = false }: ShowcaseProps) {
  // Accent blue, not brand violet: #6C5CE7 on the near-black background is
  // 4.14:1 — under the 4.5:1 needed at this size. #4EA8FF is 7.9:1.
  const heading = (
    <>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      <h2 className="mt-4 font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
        {line}
      </h2>
    </>
  )

  if (full) {
    return (
      <section className={cn(SECTION_RHYTHM, 'max-w-6xl')}>
        <Reveal className="mx-auto max-w-2xl text-center">{heading}</Reveal>
        <Reveal direction="scale" delay={80} className="mt-10 sm:mt-12">
          {children}
        </Reveal>
      </section>
    )
  }

  return (
    <section className={cn(SECTION_RHYTHM, 'max-w-6xl')}>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal direction={flip ? 'right' : 'left'} className={cn(flip && 'lg:order-2')}>
          {heading}
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
              {/*
                THE HEADLINE NAMES THE ENEMY, NOT THE FEATURE.

                It used to read "Plan a realistic day. Not a wish-list." That is
                a true description of the product and a weak first sentence: it
                asks the reader to accept that their day is currently
                unrealistic before they have been shown why. The version below
                states a fact nobody argues with, and the product becomes the
                obvious consequence of it one line later.
              */}
              <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                {/* Two block spans rather than a `<br>`: each line can then
                    carry its own delay, and the accessible name is unchanged. */}
                <span className="hero-rise block" style={{ '--rise-delay': '90ms' } as CSSProperties}>
                  Your list is infinite.
                </span>
                <span
                  className="hero-rise text-gradient-brand block"
                  style={{ '--rise-delay': '210ms' } as CSSProperties}
                >
                  Your day is not.
                </span>
              </h1>
              <p
                className="hero-rise mt-6 max-w-md text-base leading-relaxed text-text-muted sm:text-lg"
                style={{ '--rise-delay': '330ms' } as CSSProperties}
              >
                Todonado gives every task the minutes it really takes, so you can see what fits
                before you commit. Then it helps you start, and picks up whatever slips.
              </p>
              <div
                className="hero-rise mt-9 flex flex-col gap-3 sm:flex-row"
                style={{ '--rise-delay': '430ms' } as CSSProperties}
              >
                <Button size="lg" onClick={startFree} className="cta-sheen">
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
                {/*
                  SECOND CTA IS EXPLORATION, NOT PURCHASE.

                  This was "See pricing", which asks a stranger to evaluate cost
                  before they have been told what the thing does. Pricing is
                  still one click away in the header, the teaser, the closing
                  CTA and the footer. A real anchor, so it works from the
                  keyboard and survives with no JavaScript running.
                */}
                <a href="#why-days-slip" className="sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    See how it works
                  </Button>
                </a>
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
        {/* 2. THE PROBLEM. The page used to go straight from the hero to a   */}
        {/*    solution, so a visitor met the answer before the question and  */}
        {/*    could read four demos still thinking "a list with a timer".    */}
        {/*    It is also the hero's secondary CTA target.                    */}
        {/* ---------------------------------------------------------------- */}
        <div id="why-days-slip" className="scroll-mt-20">
          <LazySection minHeight={900}>
            <Suspense fallback={null}>
              <ProblemSection />
            </Suspense>
          </LazySection>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* 3. THE ANSWER, in four live widgets. Each runs the product's real */}
        {/*    logic; the thread between them says they are one system.       */}
        {/* ---------------------------------------------------------------- */}
        <Showcase
          eyebrow="Capacity"
          line={
            <>
              So give the day a <span className="text-warning">limit</span>.
            </>
          }
        >
          <LazyWidget component={CapacityDemo} minHeight={360} label="the capacity demo" />
        </Showcase>

        <SectionThread />

        {/* The one motivational beat with an attributed quotation behind it,
            placed so the idea and the feature that implements it are adjacent
            rather than a screen apart. */}
        <LazySection minHeight={640}>
          <Suspense fallback={null}>
            <GoalsSystems />
          </Suspense>
        </LazySection>

        <Showcase
          eyebrow="From intention to plan"
          flip
          line={
            <>
              A goal is not a plan until it has{' '}
              <span className="text-gradient-brand">a time</span>.
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
              Then <span className="text-success">protect the time</span> you set aside.
            </>
          }
        >
          <LazyWidget component={FocusDemo} minHeight={450} label="the focus demo" />
        </Showcase>

        <SectionThread />

        {/* RECOVERY. A founding principle of this product that appeared on no
            public surface at all, which left the story implying the plan always
            holds. It never does, and the reader knows it. */}
        <Showcase
          eyebrow="Recovery"
          flip
          line={
            <>
              Bad days happen.{' '}
              <span className="text-accent">They should not compound.</span>
            </>
          }
        >
          <LazyWidget component={RecoveryDemo} minHeight={620} label="the recovery demo" />
        </Showcase>

        <SectionThread />

        {/*
          THE COVEY QUOTATION WAS CUT HERE, AND IT WAS VERIFIED.

          "The key is not to prioritize what's on your schedule, but to schedule
          your priorities" is genuinely Covey, genuinely from 7 Habits p.161,
          and genuinely about weekly planning, which is why it sat above this
          section. It was removed anyway, on editorial grounds.

          Two attributed quotations on one page starts to make the page sound
          like it is quoting its way to authority rather than showing a product,
          and the second one has to be better than the silence it replaces. This
          one was not: the week board already argues "decide what does not get a
          slot" by making every day's capacity visible, so the quote restated
          the section's own point in someone else's voice. Cutting it also makes
          the one remaining quotation land harder.

          The verification survives in docs/HOMEPAGE_V2_CLAIMS.md, so putting it
          back is a paste, not a research job.
        */}

        {/* Week planning is the flagship paid feature and was invisible to anyone
            who hadn't signed up. This runs the REAL planWeek, same as the app. */}
        <Showcase
          eyebrow="The week"
          full
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

        {/* The one research moment, and it sits here because it is the SETUP
            for the loop below rather than a fact dropped in for credibility:
            people underestimate their own work, so a system that measures what
            things actually took is answering a real and well-documented
            problem rather than an invented one. */}
        <LazySection minHeight={360}>
          <Suspense fallback={null}>
            <ResearchMoment />
          </Suspense>
        </LazySection>

        {/* ---------------------------------------------------------------- */}
        {/* 4. THE SYSTEM. Only now, once every piece has been shown working, */}
        {/*    does the page explain why they belong in one product. It does  */}
        {/*    it by following one number around the loop rather than by      */}
        {/*    claiming "all in one", which is the sentence every visitor has  */}
        {/*    already learned to skip.                                       */}
        {/* ---------------------------------------------------------------- */}
        <LazySection minHeight={900}>
          <Suspense fallback={null}>
            <SystemLoop />
          </Suspense>
        </LazySection>

        {/*
          THE ONE MID-PAGE CTA.

          Between the hero and the breadth strip there was no primary action at
          all, which on a phone is something like thirteen thousand pixels of
          argument with nothing to act on. It goes HERE, at the end of the
          system section, because that is where the case finishes: everything
          after it is reassurance about breadth, price and objections.

          Deliberately a single control on a plain rule rather than another
          panel. The page already closes on a full CTA card, and two of those
          would make the second one look like a retry.
        */}
        <section className="mx-auto w-full max-w-3xl px-4 pb-4 text-center sm:px-6">
          <Reveal>
            <div className="border-t border-white/5 pt-12">
              {/* No "takes about a minute" here, deliberately. It is the
                  conventional line for this slot and it is a number nobody has
                  measured, on a page whose whole discipline is not shipping
                  claims it cannot back. */}
              <p className="font-display text-lg font-semibold sm:text-xl">
                That is the whole system. Now put your own day through it.
              </p>
              <div className="mt-5 flex justify-center">
                <Button size="lg" onClick={startFree} className="cta-sheen">
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <p className="mt-3 text-xs text-text-muted">
                Free to start · no credit card
              </p>
            </div>
          </Reveal>
        </section>

        {/* The breadth, stated as a fact and linked to the real surfaces. It
            follows the loop rather than preceding it, so "one place" arrives as
            evidence for a claim already made rather than as a feature wall. */}
        <LazySection minHeight={560}>
          <Suspense fallback={null}>
            <OnePlaceStrip />
          </Suspense>
        </LazySection>

        {/* Focus & Calm: shipped modules link into the app; the one that
            isn't usable yet keeps the insert-only feature_intents fake door. */}
        <LazySection minHeight={560}>
          <Suspense fallback={null}>
            <WellnessTeaser />
          </Suspense>
        </LazySection>

        {/* ---------------------------------------------------------------- */}
        {/* 5. WHAT IT ADDS UP TO. The emotional close, held to what the      */}
        {/*    software actually records.                                     */}
        {/* ---------------------------------------------------------------- */}
        <LazySection minHeight={760}>
          <Suspense fallback={null}>
            <IdentitySection />
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
                {/*
                  THE CLOSE LOWERS THE BAR ON PURPOSE.

                  Everything above this point argues that most days are planned
                  badly, which is a heavy note to end on. A closing CTA that
                  then asks for a life overhaul earns a "not today". Asking for
                  ONE honest day is both the smallest possible commitment and
                  exactly what the product does, so the ask and the promise are
                  the same size.
                */}
                <h2 className="font-display text-2xl font-bold sm:text-4xl">
                  Start with today.
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-text-muted">
                  Not the whole year. Not a new system for your life. One day, planned honestly,
                  that you can actually finish. Then do it again tomorrow.
                </p>
                {/*
                  ONE ACTION. The close used to carry a "Compare plans" link
                  beside it, which was a third label for /pricing (after "See
                  what Pro includes" and "Compare all plans") and it sat
                  directly BELOW the pricing section the reader had just
                  scrolled through. An ending that offers a choice is not an
                  ending; this is the conclusion of the story, so it asks for
                  exactly one thing.
                */}
                <div className="mt-8 flex justify-center">
                  <Button size="lg" onClick={startFree} className="cta-sheen">
                    {ctaLabel}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
                <p className="mt-4 text-xs text-text-muted">
                  Free to start · no credit card · works on your phone and laptop
                </p>
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
