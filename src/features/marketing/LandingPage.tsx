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
import { Beat, Chapter } from './components/Chapter'
import { useInView } from './demo/useReveal'
import { SECTION_RHYTHM } from './sectionRhythm'

/**
 * The three below-the-fold demos are code-split and mounted only as they near
 * the viewport, so the landing chunk stays lean and the hero — which IS
 * interactive on first paint — never competes with them for bandwidth.
 */
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
const SystemLoop = lazy(() =>
  import('./components/SystemLoop').then((m) => ({ default: m.SystemLoop })),
)
const OnePlaceStrip = lazy(() =>
  import('./components/OnePlaceStrip').then((m) => ({ default: m.OnePlaceStrip })),
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
      {/* One step smaller on a phone ONLY. Five showcase headlines at the
          desktop display size is about 200px of heading on mobile, and at 390px
          a 3xl line wraps to three lines where a 2xl wraps to two. Desktop
          scale is unchanged. */}
      <h2 className="mt-3 font-display text-2xl font-bold leading-[1.15] tracking-tight md:text-3xl lg:mt-4 lg:text-5xl lg:leading-[1.1]">
        {line}
      </h2>
    </>
  )

  if (full) {
    return (
      <section className={cn(SECTION_RHYTHM, 'max-w-6xl')}>
        <Reveal className="mx-auto max-w-2xl text-center">{heading}</Reveal>
        <Reveal direction="scale" delay={80} className="mt-6 lg:mt-12">
          {children}
        </Reveal>
      </section>
    )
  }

  return (
    <section className={cn(SECTION_RHYTHM, 'max-w-6xl')}>
      <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-16">
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
        {/* ================================================================ */}
        {/*  CHAPTER 1 — ORIGIN                                 tone: origin  */}
        {/*                                                                   */}
        {/*  The signature meter, live and moving, above the fold. `origin`   */}
        {/*  adds NOTHING to the scene: the page-wide aurora and the vortex    */}
        {/*  are already at full strength here, and every later chapter is    */}
        {/*  defined by how it modulates this. `flush` because the hero sizes  */}
        {/*  itself to the viewport and must not also pay chapter padding.    */}
        {/* ================================================================ */}
        <Chapter
          tone="origin"
          flush
          className="flex min-h-[calc(100svh_-_4rem)] flex-col justify-center overflow-hidden"
        >
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
        </Chapter>

        {/* ================================================================ */}
        {/*  CHAPTER 2 - MAKE THE DAY REAL                     tone: measure  */}
        {/*                                                                   */}
        {/*  ONE PLANNING STORY, NOT THREE PLANNING DEMOS.                    */}
        {/*                                                                   */}
        {/*  This was the page's worst redundancy and it took an audit to see */}
        {/*  it: capacity was proved THREE times over. The hero meter fills   */}
        {/*  live to 92%, the problem section runs the real computeCapacity   */}
        {/*  over ten tasks, and then an interactive capacity widget invited  */}
        {/*  the reader to do it a third time. The widget went. What is left  */}
        {/*  is one evolving arc: the day does not fit, one tap makes it fit,  */}
        {/*  and the same rule then holds for seven days at once.             */}
        {/* ================================================================ */}
        <Chapter tone="measure" id="why-days-slip">
          <LazySection minHeight={900}>
            <Suspense fallback={null}>
              <ProblemSection />
            </Suspense>
          </LazySection>

          <Beat>
            <Showcase
              eyebrow="The plan"
              line={
                <>
                  So give the day a limit, and let it{' '}
                  <span className="text-gradient-brand">fill itself</span>.
                </>
              }
            >
              <LazyWidget component={AutoPlanDemo} minHeight={640} label="the auto-plan demo" />
            </Showcase>
          </Beat>

          <Beat>
            <Showcase
              eyebrow="The week"
              full
              line={
                <>
                  Then seven days that <span className="text-gradient-brand">all fit</span>.
                </>
              }
            >
              <LazyWidget component={WeekBoardDemo} minHeight={420} label="the week board demo" />
            </Showcase>
          </Beat>
        </Chapter>

        {/* ================================================================ */}
        {/*  CHAPTER 3 - DO THE WORK, RECOVER WHEN LIFE HAPPENS  tone: focus  */}
        {/*                                                                   */}
        {/*  One causal story rather than two features: you protect the time,  */}
        {/*  and then the day slips anyway. The scene is the darkest on the   */}
        {/*  page so the product UI is the brightest thing in it.             */}
        {/* ================================================================ */}
        <Chapter tone="focus">
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

          <Beat first>
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
          </Beat>
        </Chapter>

        {/* ================================================================ */}
        {/*  CHAPTER 4 - YOUR SYSTEM LEARNS                     tone: system  */}
        {/*                                                                   */}
        {/*  The intellectual centrepiece, and now the only home for the two  */}
        {/*  supporting ideas that each used to own a chapter. The James      */}
        {/*  Clear line is an epigraph at the top; the planning-fallacy        */}
        {/*  finding is a footnote at the bottom. Both belong to this         */}
        {/*  argument, and neither is big enough to be an argument.           */}
        {/*                                                                   */}
        {/*  The one mid-page CTA closes it, because this is where the case   */}
        {/*  finishes. Everything after is reassurance.                        */}
        {/* ================================================================ */}
        <Chapter tone="system">
          <LazySection minHeight={900}>
            <Suspense fallback={null}>
              <SystemLoop />
            </Suspense>
          </LazySection>

          <Beat>
            <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6">
              <Reveal>
                <p className="font-display text-lg font-semibold sm:text-xl">
                  That is the whole system. Now put your own day through it.
                </p>
                <div className="mt-5 flex justify-center">
                  <Button size="lg" onClick={startFree} className="cta-sheen">
                    {ctaLabel}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
                <p className="mt-3 text-xs text-text-muted">Free to start · no credit card</p>
              </Reveal>
            </div>
          </Beat>
        </Chapter>

        {/* ================================================================ */}
        {/*  CHAPTER 5 - MORE THAN A PLANNER                    tone: system  */}
        {/*                                                                   */}
        {/*  BREADTH IN ONE STOP, NOT TWO.                                    */}
        {/*                                                                   */}
        {/*  The wellness teaser was the second breadth argument in a row:    */}
        {/*  three module cards and an interest card, 575px on a phone, for a */}
        {/*  story this strip already tells. The strip names Calm among its   */}
        {/*  five surfaces and links straight into breathwork, so removing    */}
        {/*  the teaser costs the page no claim and no destination — it only  */}
        {/*  stops making the same point twice. The component still exists;   */}
        {/*  it is the homepage that no longer needs a landing page for a     */}
        {/*  secondary module. The anonymous fake-door for guided meditation  */}
        {/*  goes with it; the signed-in /wellness hub still carries it.      */}
        {/* ================================================================ */}
        <Chapter tone="system">
          <LazySection minHeight={560}>
            <Suspense fallback={null}>
              <OnePlaceStrip />
            </Suspense>
          </LazySection>
        </Chapter>

        {/* ================================================================ */}
        {/*  CHAPTER 6 - COMMIT                                  tone: close  */}
        {/*                                                                   */}
        {/*  PURELY COMMERCIAL: price, three objections, the ask.             */}
        {/*                                                                   */}
        {/*  The identity beat ("become the person who plans their day") led  */}
        {/*  this chapter and cost 737px. Its four proofs are the planning    */}
        {/*  streak, recorded focus time, completed history and the clean     */}
        {/*  streak — which is chapters 2, 3 and 4 restated as motivation     */}
        {/*  after the argument has already been made and won. A close that   */}
        {/*  re-argues is a close that delays. The component is kept, and so  */}
        {/*  is the test that guards its copy; it is off the homepage.        */}
        {/* ================================================================ */}
        <Chapter tone="close">
          <LazySection minHeight={700}>
            <Suspense fallback={null}>
              <PricingTeaser onStartFree={startFree} ctaLabel={ctaLabel} />
            </Suspense>
          </LazySection>

          <Beat>
            <LazySection minHeight={420}>
              <Suspense fallback={null}>
                <LandingFaq />
              </Suspense>
            </LazySection>
          </Beat>

          <Beat>
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <Reveal>
                <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-surface px-6 py-14 text-center shadow-elevation-lg sm:py-16">
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

                      Everything above this point argues that most days are
                      planned badly, which is a heavy note to end on. A closing
                      CTA that then asks for a life overhaul earns a "not
                      today". Asking for ONE honest day is both the smallest
                      possible commitment and exactly what the product does.
                    */}
                    <h2 className="font-display text-2xl font-bold sm:text-4xl">
                      Start with today.
                    </h2>
                    <p className="mx-auto mt-4 max-w-lg text-text-muted">
                      Not the whole year. Not a new system for your life. One day, planned honestly,
                      that you can actually finish. Then do it again tomorrow.
                    </p>
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
            </div>
          </Beat>
        </Chapter>

      </main>

      <div className="relative z-10">
        <MarketingFooter />
      </div>
    </div>
  )
}
