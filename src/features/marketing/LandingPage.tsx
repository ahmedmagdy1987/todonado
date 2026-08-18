import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { LivingBackground } from './components/LivingBackground'
import { VortexField } from './components/VortexField'
import { MarketingHeader } from './components/MarketingHeader'
import { MarketingFooter } from './components/MarketingFooter'
import { CONTAINER, Section, SectionIntro } from './components/Section'
import { ProductShot } from './components/ProductShot'
import { Differentiators } from './components/Differentiators'
import { FeatureMap } from './components/FeatureMap'
import { HowItWorks } from './components/HowItWorks'
import { CategoryComparison } from './components/CategoryComparison'
import { WhyPro } from './components/WhyPro'
import { PlanComparison } from './components/PlanComparison'
import { PricingCards } from './components/PricingCards'
import { LandingFaq } from './components/LandingFaq'
import { ALL_IN_ONE_CATEGORIES, PRICING_DISCLAIMER } from './plans'

/**
 * THE COMMERCIAL LANDING PAGE.
 *
 * ── STATIC CLARITY FIRST, INTERACTIVE PROOF SECOND ─────────────────────────
 *
 * The page this replaces taught the product through six self-playing widgets
 * spread over eleven and a half thousand pixels. It demonstrated Todonado well
 * to anyone who waited and pressed things, and explained almost nothing to
 * somebody scrolling on a phone: the capacity meter began EMPTY, the feature
 * list was distributed through a story, and the word "Pro" appeared for the
 * first time next to a price.
 *
 * Everything a buyer needs is now readable without a single click, and each of
 * the seven sections answers exactly one question:
 *
 *   1  Hero          what is this, and what does it look like
 *   2  Different     why not just a to-do list
 *   3  Features      what is actually in it
 *   4  How it works  how the parts connect
 *   5  Compare       where it sits next to what I already use
 *   6  Pro + price   what costs money, and why that is fair
 *   7  FAQ + close   the three things I still want to ask
 *
 * ── THE MATERIALS ARE THE STRUCTURE ────────────────────────────────────────
 *
 * `Section` alternates opaque materials (see its header for the full rule), so
 * every boundary is a real edge instead of a cross-dissolve. The aurora is
 * `contained` INSIDE the hero rather than fixed behind the document: it is a
 * brand moment at the top of the page, not the page's background.
 */
export function LandingPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const startFree = () =>
    session
      ? navigate('/today')
      : navigate('/login', {
          state: { ...((location.state as object | null) ?? {}), mode: 'signup' },
        })

  const ctaLabel = session ? 'Open your command center' : 'Start free'

  useHashScroll()

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-text-primary">
      <MarketingHeader />

      <main className="flex-1">
        {/* ═══════════════ 1 · HERO ═══════════════════════════════════════ */}
        <Section material="brand" flush className="isolate overflow-hidden">
          {/*
            THE BRAND MOMENT, AND THE ONLY ONE.
            Both layers are scoped to this box: the aurora is `contained` rather
            than fixed to the viewport, and the vortex is already absolute. So
            the atmosphere belongs to the hero and stops costing anything the
            moment it scrolls away, instead of sitting behind the whole document
            where every opaque section below hides it anyway.
          */}
          <LivingBackground contained />
          <VortexField />

          <div
            className={`${CONTAINER} relative z-10 grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2 lg:gap-14 lg:py-24`}
          >
            <div>
              <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Your list is infinite.
                <br />
                Your day is not.
              </h1>

              {/*
                THE CATEGORY, IN THE FIRST PARAGRAPH.
                A visitor should not need the next section to work out what kind
                of product this is. Plan, do, learn: the whole loop in one
                sentence, in the order the product performs it.
              */}
              <p className="mt-5 max-w-xl text-base leading-relaxed text-text-muted sm:text-lg">
                Todonado is a daily planner that works in hours, not wishes. It plans your day
                around the time you actually have, carries that plan into a focus timer, and uses
                what really happened to make the next day's plan better.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={startFree} className="cta-sheen">
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
                {/*
                  An anchor, not a Button, because it navigates. Wrapping a
                  <button> in an <a> is invalid and announces twice, and the
                  Button primitive has no `asChild`, so the secondary CTA
                  borrows the outline variant's classes directly.
                */}
                <a
                  href="#features"
                  className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 px-6 text-base font-medium text-text-primary transition-colors hover:bg-surface-2/60"
                >
                  See what Todonado does
                </a>
              </div>

              <p className="mt-5 text-sm text-text-muted">
                Free forever for a complete day. No card to start.
              </p>
            </div>

            {/* One authentic product composition. Finished on first paint. */}
            <ProductShot className="lg:justify-self-end" />
          </div>
        </Section>

        {/* ═══════════════ 2 · WHY IT IS DIFFERENT ════════════════════════ */}
        <Section material="panel" ariaLabel="Why Todonado is different">
          <div className={CONTAINER}>
            <TwoColumnIntro
              eyebrow="01 · The difference"
              title="Most planners track what you owe. This one tracks what you have."
              lede="A list will happily let you plan fourteen hours into an eight hour day. These three things are what stop that, and they are the same system rather than three features."
            />
            <Differentiators className="mt-8 sm:mt-10" />
          </div>
        </Section>

        {/* ═══════════════ 3 · WHAT IS INSIDE ═════════════════════════════ */}
        <Section material="data" id="features" ariaLabel="What is inside Todonado">
          <div className={CONTAINER}>
            <TwoColumnIntro
              eyebrow="02 · Features"
              title="One app instead of several"
              lede="A day planner, a focus and pomodoro timer, a habit and quit tracker, a breathing coach, a journal and a mind-map canvas. Every line below is a screen you can open on the day you sign up."
            />
            <FeatureMap className="mt-8 sm:mt-10" />

            {/* The shared category list, so this page and /pricing state the
                breadth claim in identical words. */}
            <ul className="mt-10 flex flex-wrap gap-2 border-t border-white/[0.07] pt-6">
              {ALL_IN_ONE_CATEGORIES.map((category) => (
                <li
                  key={category}
                  className="rounded-full border border-white/10 bg-surface px-3 py-1.5 text-xs text-text-muted"
                >
                  {category}
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* ═══════════════ 4 · HOW IT WORKS ═══════════════════════════════ */}
        <Section material="panel" id="how-it-works" ariaLabel="How the system works">
          <div className={CONTAINER}>
            <TwoColumnIntro
              eyebrow="03 · How it works"
              title="Plan it, work it, learn from it"
              lede="Three steps, and the same task runs through all of them. The screens below are the real app."
            />
            <HowItWorks className="mt-8 sm:mt-10" />
          </div>
        </Section>

        {/* ═══════════════ 5 · COMPARE ════════════════════════════════════ */}
        <Section material="data" id="compare" ariaLabel="How Todonado compares">
          <div className={CONTAINER}>
            <TwoColumnIntro
              eyebrow="04 · Compare"
              title="Where this sits next to what you already use"
              lede="Most people are running three of these at once. None of them are bad tools, they simply answer a different question."
            />
            <CategoryComparison className="mt-8 sm:mt-10" />
          </div>
        </Section>

        {/* ═══════════════ 6 · PRO, FREE VS PRO, PRICE ════════════════════ */}
        <Section material="premium" id="pricing" ariaLabel="Free and Pro">
          <div className={CONTAINER}>
            <SectionIntro
              eyebrow="05 · Free and Pro"
              title="Free is enough to run today. Pro is for the system you keep."
              lede="Everything that makes one day work is free, permanently, and always will be. Pro is what you buy when one day stops being the unit you think in."
              centered
            />

            <WhyPro className="mt-8 sm:mt-12" />

            <div className="mt-10 rounded-2xl border-white/10 bg-background/60 sm:mt-14 sm:border sm:p-8">
              <h3 className="font-display text-lg font-semibold text-text-primary">
                What actually changes
              </h3>
              <PlanComparison className="mt-4" />
            </div>

            <PricingCards onStartFree={startFree} className="mt-10 sm:mt-12" />

            {/*
              The one canonical sentence about what Pro costs and how you get
              it. Shared with /pricing from a single constant, so the two pages
              cannot word the same offer differently.
            */}
            <p className="mt-6 text-center text-sm text-text-muted">{PRICING_DISCLAIMER}</p>
          </div>
        </Section>

        {/* ═══════════════ 7 · FAQ + CLOSE ════════════════════════════════ */}
        <Section material="quiet" ariaLabel="Questions and getting started">
          <div className={CONTAINER}>
            <LandingFaq />

            <div className="mx-auto mt-16 max-w-xl text-center">
              <h2 className="font-display text-2xl font-bold sm:text-3xl">Start with today.</h2>
              <p className="mt-3 text-text-muted">
                Not the whole year, and not a new system for your life. One day, planned in the
                time you actually have.
              </p>
              <Button size="lg" onClick={startFree} className="cta-sheen mt-7">
                {ctaLabel}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </Section>
      </main>

      <MarketingFooter />
    </div>
  )
}

/**
 * A section opening laid out as two columns on wide screens.
 *
 * Title left, description right. It saves roughly 120px of vertical space per
 * section against the stacked-and-centred alternative, which across six
 * sections is most of a phone screen, and it is the single change that stops a
 * page reading as a stack of posters: every section now shares one left edge
 * with the content beneath it.
 */
function TwoColumnIntro({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string
  title: string
  lede: string
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-12">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
        <h2 className="mt-3 font-display text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl">
          {title}
        </h2>
      </div>
      {/* 38ch keeps a comfortable measure without centring the text. */}
      <p className="max-w-[38ch] self-end text-sm leading-relaxed text-text-muted sm:text-base">
        {lede}
      </p>
    </div>
  )
}

/**
 * Scroll to `#section` when the page is opened with a hash.
 *
 * Needed because the header's links are router links from other pages, and a
 * router navigation does not scroll to a fragment by itself. The retry exists
 * because the target may be below a lazily-rendered image that has not settled
 * on the frame the hash arrives, so a single `scrollIntoView` can land short.
 * Bounded, so a hash pointing at nothing gives up instead of spinning.
 */
function useHashScroll() {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    let attempts = 0
    let frame = 0
    const tryScroll = () => {
      const target = document.querySelector(hash)
      if (target) {
        target.scrollIntoView({ behavior: 'auto', block: 'start' })
        return
      }
      if (attempts++ < 20) frame = requestAnimationFrame(tryScroll)
    }
    tryScroll()
    return () => {
      if (frame) cancelAnimationFrame(frame)
    }
  }, [hash])
}
