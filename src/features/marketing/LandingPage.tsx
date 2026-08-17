import { Suspense, lazy, useEffect, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { LivingBackground } from './components/LivingBackground'
import { VortexField } from './components/VortexField'
import { SiteHeader } from './components/SiteHeader'
import { MarketingFooter } from './components/MarketingFooter'
import { HeroMeterDemo } from './demo/HeroMeterDemo'
import { LazySection, LazyWidget, Reveal } from './demo/Reveal'
import { Beat, Chapter } from './components/Chapter'
import { Band } from './components/Band'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  LANDING V3 — THE PRODUCT IS EXPLAINED BEFORE IT IS DEMONSTRATED.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT WAS WRONG, AND IT WAS NOT VISUAL ──────────────────────────────────
 *
 * V2 was six chapters of storytelling wrapped around five interactive widgets.
 * It was technically clean and it read beautifully, and a visitor could scroll
 * the whole 9,900px without ever being told, in words:
 *
 *   what Todonado is · what it contains · how it differs from what they
 *   already use · what Free includes · why Pro is worth paying for
 *
 * The argument existed, but only for someone willing to stop and PLAY with
 * things. Interaction was the price of comprehension, which is a bad trade to
 * ask of a stranger. The demos were never the problem; being the only copy of
 * the argument was.
 *
 * ── THE RULE THIS PAGE IS BUILT ON ─────────────────────────────────────────
 *
 * A visitor must be able to scroll from top to bottom, CLICKING NOTHING, and
 * come away able to answer all five questions above. Every interactive widget
 * is now proof of a claim that has already been made in words. Two survive on
 * the homepage, each earning its place:
 *
 *   AutoPlanDemo — proves "one tap fills the day without going over"
 *   WeekBoardDemo — proves the flagship PAID feature does what Pro claims,
 *                   by running the real `planWeek`
 *
 * Three were removed (focus, recovery, the system loop). Each restated
 * something the page now says plainly in a paragraph, and between them they
 * were about 2,600px of scrolling. `SystemLoop`'s two outside sources were too
 * good to lose with it and moved to `ProofNotes`.
 *
 * ── MATERIALS, NOT MORE TONES ──────────────────────────────────────────────
 *
 * The five `Chapter` tones are translucent by design, so the page-wide aurora
 * shows through all of them. That is why V2 still read as one continuous
 * gradient however many tones it used: modulated light is still the same
 * light. `Band` introduces OPAQUE surfaces, so a boundary becomes a change of
 * material. No new colour is introduced anywhere; what alternates is opacity
 * and elevation.
 *
 *   1 hero .............. Chapter origin    atmosphere
 *   2 why different ..... Band solid        first material change
 *   3 how it works ...... Band raised       lighter, real screenshot
 *   4 proof ............. Chapter measure   atmosphere returns
 *   5 what is inside .... Band raised       dense, scannable
 *   6 compare ........... Band editorial    deepest, ruled
 *   7 why Pro ........... Band premium      the one brand wash on the page
 *   8 free vs Pro ....... Band solid        the table
 *   9 price + close ..... Chapter close     calm
 *
 * The commercial half (6, 7, 8) is deliberately unbroken material: it is the
 * part a visitor reads carefully rather than feels, and small text over a
 * slowly moving gradient is the one place the aurora costs real legibility.
 */

/** Proof widgets: code-split, mounted only as they approach the viewport. */
const WeekBoardDemo = lazy(() =>
  import('./demo/WeekBoardDemo').then((m) => ({ default: m.WeekBoardDemo })),
)

/** Everything below the hero is deferred the same way. */
const ProblemSection = lazy(() =>
  import('./components/ProblemSection').then((m) => ({ default: m.ProblemSection })),
)
const Differentiators = lazy(() =>
  import('./components/Differentiators').then((m) => ({ default: m.Differentiators })),
)
const HowItWorks = lazy(() =>
  import('./components/HowItWorks').then((m) => ({ default: m.HowItWorks })),
)
const ProofNotes = lazy(() =>
  import('./components/ProofNotes').then((m) => ({ default: m.ProofNotes })),
)
const OnePlaceStrip = lazy(() =>
  import('./components/OnePlaceStrip').then((m) => ({ default: m.OnePlaceStrip })),
)
const WellnessTeaser = lazy(() =>
  import('./components/WellnessTeaser').then((m) => ({ default: m.WellnessTeaser })),
)
const CategoryComparison = lazy(() =>
  import('./components/CategoryComparison').then((m) => ({ default: m.CategoryComparison })),
)
const WhyPro = lazy(() => import('./components/WhyPro').then((m) => ({ default: m.WhyPro })))
const PlanTable = lazy(() =>
  import('./components/PlanTable').then((m) => ({ default: m.PlanTable })),
)
const LandingFaq = lazy(() =>
  import('./components/LandingFaq').then((m) => ({ default: m.LandingFaq })),
)
const PricingTeaser = lazy(() =>
  import('./components/PricingTeaser').then((m) => ({ default: m.PricingTeaser })),
)

/**
 * Scroll to a section arrived at by hash.
 *
 * React Router does not do this, and the header navigates to `/welcome#compare`
 * from the other public pages. The retry matters: the target section is lazily
 * mounted, so on a cold arrival the element usually does not exist yet and a
 * single attempt silently does nothing. Bounded so it can never spin.
 */
function useHashScroll(hash: string) {
  useEffect(() => {
    if (!hash) return
    const id = hash.slice(1)
    let tries = 0
    const timer = window.setInterval(() => {
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        window.clearInterval(timer)
        return
      }
      if ((tries += 1) > 40) window.clearInterval(timer)
    }, 100)
    return () => window.clearInterval(timer)
  }, [hash])
}

export function LandingPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useHashScroll(location.hash)

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
      <LivingBackground />

      <SiteHeader />

      <main className="relative z-10 flex-1">
        {/* ================================================================ */}
        {/*  1 — HERO                                          tone: origin   */}
        {/*                                                                   */}
        {/*  Unchanged in substance. The headline names the enemy rather than */}
        {/*  the feature, and the subhead is the plain-English answer to      */}
        {/*  "what is this": minutes, what fits, then help starting.          */}
        {/*                                                                   */}
        {/*  The second CTA now points at the capability section rather than  */}
        {/*  at the problem chapter. "See how it works" sent a visitor into   */}
        {/*  an argument; someone pressing a secondary button on a landing    */}
        {/*  page is asking what they would be getting.                       */}
        {/* ================================================================ */}
        <Chapter
          tone="origin"
          flush
          className="flex min-h-[calc(100svh_-_4rem)] flex-col justify-center overflow-hidden"
        >
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
          <VortexField />

          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-10 sm:gap-12 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div>
              <Badge variant="brand" className="hero-rise mb-6">
                <Sparkles className="h-3 w-3" aria-hidden />
                Your daily command center
              </Badge>
              <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
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
                A day planner that counts the minutes. Give every task the time it really takes,
                see what fits before you commit, focus on it, and carry forward whatever slips.
              </p>
              <div
                className="hero-rise mt-9 flex flex-col gap-3 sm:flex-row"
                style={{ '--rise-delay': '430ms' } as CSSProperties}
              >
                <Button size="lg" onClick={startFree} className="cta-sheen">
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
                {/* A real anchor, so it works from the keyboard and survives
                    with no JavaScript running. */}
                <a href="#product" className="sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    See what is inside
                  </Button>
                </a>
              </div>
              <p
                className="hero-rise mt-4 text-xs text-text-muted"
                style={{ '--rise-delay': '520ms' } as CSSProperties}
              >
                Free to start · no credit card · works on your phone and laptop.
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <div
                className="hero-rise relative"
                style={{ '--rise-delay': '300ms' } as CSSProperties}
              >
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
        {/*  2 — WHY IT IS DIFFERENT                       material: solid    */}
        {/*                                                                   */}
        {/*  The first opaque surface on the page, and the point at which a   */}
        {/*  visitor should stop wondering what they are looking at. Three    */}
        {/*  claims, in causal order, all of them free features.              */}
        {/* ================================================================ */}
        <Band material="solid" labelledBy="why-different">
          <LazySection minHeight={620}>
            <Suspense fallback={null}>
              <Differentiators />
            </Suspense>
          </LazySection>
        </Band>

        {/* ================================================================ */}
        {/*  3 — HOW IT WORKS                             material: raised    */}
        {/*                                                                   */}
        {/*  Three steps and the real Today screen. The screenshot had been   */}
        {/*  sitting unused in `public/shots` — a grep for it across src      */}
        {/*  returned nothing — while the page relied entirely on widgets.    */}
        {/* ================================================================ */}
        <Band material="raised" id="how-it-works" labelledBy="how-it-works-title">
          <LazySection minHeight={620}>
            <Suspense fallback={null}>
              <HowItWorks />
            </Suspense>
          </LazySection>
        </Band>

        {/* ================================================================ */}
        {/*  4 — PROOF                                        tone: measure   */}
        {/*                                                                   */}
        {/*  Atmosphere returns, and the claims above get evidence: the real  */}
        {/*  `computeCapacity` over ten ordinary tasks, then one tap of the   */}
        {/*  real planner. The two outside sources close it, small and under  */}
        {/*  the product proof rather than above it.                          */}
        {/* ================================================================ */}
        <Chapter tone="measure" id="why-days-slip">
          <LazySection minHeight={900}>
            <Suspense fallback={null}>
              <ProblemSection />
            </Suspense>
          </LazySection>

          {/*
            THE AUTO-PLAN DEMO IS DELIBERATELY NOT HERE.

            It was the page's THIRD proof of the same idea. The hero meter fills
            live, the section above runs the real `computeCapacity` over ten
            ordinary tasks and shows the overflow, and then an interactive
            widget invited the reader to watch a day fill for a third time.

            It is also the one that could only communicate to somebody willing
            to press a button, which is exactly what V3 exists to stop
            requiring. The proof that survives here is the one you can read
            while scrolling past it, and the one interactive widget that
            remains (the week board, under "Why Pro") is there because it
            proves a claim about the PAID tier that a static image could not.
          */}
          <Beat>
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
              <LazySection minHeight={200}>
                <Suspense fallback={null}>
                  <ProofNotes />
                </Suspense>
              </LazySection>
            </div>
          </Beat>
        </Chapter>

        {/* ================================================================ */}
        {/*  5 — WHAT IS INSIDE                           material: raised    */}
        {/*                                                                   */}
        {/*  PROMOTED, NOT REWRITTEN. This section existed, and it was at     */}
        {/*  roughly 80% of the page depth, which is well past where most     */}
        {/*  visitors stop. It is the only place the product's breadth is     */}
        {/*  ever stated, so it now sits in the middle on a real surface and  */}
        {/*  is what the hero's second button points at.                      */}
        {/*                                                                   */}
        {/*  The wellness teaser stays with it: it is the landing's only      */}
        {/*  ANONYMOUS demand capture, and a signed-in surface cannot measure */}
        {/*  interest from people who never sign up.                          */}
        {/* ================================================================ */}
        {/* No `labelledBy` here: OnePlaceStrip carries its own
            `<section aria-labelledby="one-place">`, and naming the wrapper too
            would expose TWO regions with the same accessible name, which is
            ambiguous to a screen reader navigating by landmark. */}
        <Band material="raised" id="product">
          <LazySection minHeight={700}>
            <Suspense fallback={null}>
              <OnePlaceStrip />
            </Suspense>
          </LazySection>

          <Beat>
            <LazySection minHeight={320}>
              <Suspense fallback={null}>
                <WellnessTeaser />
              </Suspense>
            </LazySection>
          </Beat>
        </Band>

        {/* ================================================================ */}
        {/*  6 — COMPARE                               material: editorial    */}
        {/*                                                                   */}
        {/*  By CATEGORY, never by brand. See comparison.ts for why that is   */}
        {/*  the honest choice here and not merely the safe one.              */}
        {/* ================================================================ */}
        <Band material="editorial" id="compare" labelledBy="compare-title">
          <LazySection minHeight={720}>
            <Suspense fallback={null}>
              <CategoryComparison />
            </Suspense>
          </LazySection>
        </Band>

        {/* ================================================================ */}
        {/*  7 — WHY PRO                                 material: premium    */}
        {/*                                                                   */}
        {/*  The one brand wash on the page, spent on the one commercial      */}
        {/*  turn. The week board demo is here rather than in the planning    */}
        {/*  chapter, because it is the argument FOR PRO and belongs where    */}
        {/*  that argument is made.                                           */}
        {/* ================================================================ */}
        <Band material="premium" labelledBy="why-pro-title">
          <LazySection minHeight={760}>
            <Suspense fallback={null}>
              <WhyPro>
                <LazyWidget component={WeekBoardDemo} minHeight={420} label="the week board demo" />
              </WhyPro>
            </Suspense>
          </LazySection>
        </Band>

        {/* ================================================================ */}
        {/*  8 — FREE VS PRO                              material: solid     */}
        {/*                                                                   */}
        {/*  Current shipping entitlements ONLY. The audit in                 */}
        {/*  docs/PRODUCT_VALUE_AUDIT.md proposes a different ladder; none of */}
        {/*  it may appear here until it is implemented.                      */}
        {/* ================================================================ */}
        <Band material="solid" id="plans" labelledBy="plans-title">
          <LazySection minHeight={900}>
            <Suspense fallback={null}>
              <PlanTable />
            </Suspense>
          </LazySection>
        </Band>

        {/* ================================================================ */}
        {/*  9 — PRICE, QUESTIONS, THE ASK                     tone: close    */}
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
                      THE CLOSE LOWERS THE BAR ON PURPOSE. Everything above
                      argues that most days are planned badly, which is a heavy
                      note to end on. A closing CTA that then asks for a life
                      overhaul earns a "not today".
                    */}
                    <h2 className="font-display text-2xl font-bold sm:text-4xl">Start with today.</h2>
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
