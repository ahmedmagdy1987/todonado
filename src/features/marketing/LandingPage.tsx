import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'
import { HeroBackdrop } from './components/HeroBackdrop'
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
 * The parts of a life the product organises, in the order a day meets them.
 *
 * Six words at the very top of the page. It is the cheapest possible fix for
 * the complaint that the hero reads as business software: the breadth claim
 * arrives BEFORE the pitch, in the one place on a phone guaranteed to be seen,
 * instead of three lines down inside a paragraph. Every one of these is a real
 * category in the sample day beneath it, so the claim is checkable on the same
 * screen that makes it.
 */
const LIFE_DOMAINS = ['Work', 'Health', 'Family', 'Errands', 'Money', 'Routines'] as const

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
 * every boundary is a real edge instead of a cross-dissolve. The hero's light
 * is contained INSIDE the hero rather than fixed behind the document: it is a
 * brand moment at the top of the page, not the page's background.
 */

/**
 * The hero's secondary action.
 *
 * ONE DEFINITION, RENDERED IN ONE OF TWO PLACES. Below `sm` it sits after the
 * product card, where reassurance belongs on a 320px screen; from `sm` it sits
 * beside the primary button on a single row. Only ever one is displayed, so
 * only ever one is in the accessibility tree and only ever one is a tab stop.
 *
 * It is a component rather than two hand-written anchors because two copies of
 * a link are exactly the kind of thing that drifts: one gets a new href, the
 * other keeps the old one, and whichever breakpoint the reviewer happens to be
 * at is the one that looks right.
 */
function SeeHowItWorks({ className }: { className?: string }) {
  return (
    <a
      href="#how-it-works"
      className={cn(
        'focus-ring min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-base font-medium text-text-primary underline-offset-4 hover:underline sm:px-4',
        className,
      )}
    >
      See how it works
      <ArrowRight className="h-4 w-4" aria-hidden />
    </a>
  )
}

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
        <Section
          material="brand"
          flush
          ariaLabel="What Todonado is"
          /*
            `-mt-16 pt-16` LIFTS THE HERO'S BOX BEHIND THE HEADER, and it is
            there for one measured reason. The header is `sticky h-16` and
            transparent at rest, but it is IN FLOW, so the hero section used to
            begin at y=64 and `overflow-hidden` clipped the backdrop to that
            box. Sampled down the centre column, the spotlight went from L* 3.71
            at y=60 to L* 15.77 at y=66: a hard horizontal edge across the full
            width, exactly at the navigation's lower boundary, so the light read
            as a lit bar welded to the header instead of as light.
            The negative margin puts the section's box at y=0 and the matching
            padding puts the CONTENT back where it was, so the composition is
            untouched and the light simply passes behind the nav.

            65 AND NOT 64, WHICH IS NOT A ROUNDING SLIP. The header is `h-16`
            plus a `border-b border-transparent` it carries at rest purely so
            that gaining a visible border on scroll does not shift the page by a
            pixel. That border is part of its layout box, so the box is 65px and
            a `-mt-16` lift left exactly one row of unlit background above the
            light. Measured, not assumed: the hero's top was reported at y=1.
          */
          className="isolate -mt-[65px] overflow-hidden pt-[65px]"
        >
          {/*
            STRUCTURE, NOT WEATHER. The aurora and the vortex are gone; see
            HeroBackdrop.tsx for why. Nothing in the background moves now, so
            the only motion on the first screen is the plan assembling itself.
          */}
          <HeroBackdrop />

          <div
            /*
              ── WHAT THE FIRST 844 PIXELS OWE A VISITOR ────────────────────
              A measured audit of the phone hero found 240px of the fold going
              to things that were neither the promise nor the proof: a six-line
              paragraph, a second heavyweight button, and a line of microcopy
              on its own. An intermediate build spent the reclaimed space by
              hoisting the product card above the call to action, and that was
              worse in a way worth recording: it put the sign-up control 160px
              BELOW the fold, so a page whose whole argument is "this is not
              another to-do list" opened on a phone with nothing but a list of
              tasks and no way to act on it.
              The order here is the plain one - promise, proof of the promise
              in words, the ask, then the picture - and the space comes out of
              the paragraph and the gaps instead. What lands above the fold on
              a 390px screen is the headline, the sentence, both buttons, and
              the top of the card, which is now where the day's two numbers
              are drawn at a size you can actually read.
            */
            className={`${CONTAINER} relative z-10 grid gap-5 py-6 sm:gap-8 sm:py-14 lg:grid-cols-2 lg:items-center lg:gap-14 lg:py-24`}
          >
            {/*
              `display: contents` on a phone, a flex column from lg.

              THE ORDER IS THE WHOLE POINT AND IT WAS MEASURED TWICE. At 320px
              the promise, the sentence, the button and the microcopy filled the
              screen and the product card arrived at y=592 with 128 visible
              pixels: no task rows at all, and one of the two metric labels with
              its value already cut off. A visitor on the narrowest phone the
              product supports met an unexplained grey rectangle.
              The block that moved is the one that is reassurance rather than
              argument - the secondary link and the no-credit-card line. Below
              `sm` they sit AFTER the card; from `sm` the link is back beside
              the button and the microcopy back under it, which is the desktop
              composition unchanged.
            */}
            <div className="contents lg:flex lg:flex-col lg:justify-center">
            <div className="order-1">
              {/*
                THE FIRST HUNDRED PIXELS SAY "NOT JUST WORK".

                Every previous version spent its opening on a headline and then
                a paragraph, and a visitor who read only that far had no reason
                to think this was for anything but a job. Six words at the very
                top does what a sentence three lines down could not: the breadth
                claim arrives before the pitch, in the one place on a phone that
                is guaranteed to be seen.
              */}
              <ul className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                {LIFE_DOMAINS.map((domain, index) => (
                  <li
                    key={domain}
                    /*
                      A SECOND LINE HERE COSTS 28px OF THE 320px FOLD, and it
                      reads as a wrap rather than as a list. So the row is
                      trimmed to what fits one line at each width and no more:
                      four at 320, five from 360, all six from `sm`. Nothing is
                      hidden that the width could have carried.
                    */
                    className={cn(
                      'flex items-center gap-2',
                      index === 4 && 'hidden min-[360px]:flex',
                      index >= 5 && 'hidden sm:flex',
                    )}
                  >
                    {index > 0 && <span aria-hidden className="h-1 w-1 rounded-full bg-brand/60" />}
                    {domain}
                  </li>
                ))}
              </ul>

              <h1 className="mt-4 font-display text-[2.05rem] font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
                Your list is infinite.
                <br />
                Your day is not.
              </h1>

              {/*
                ONE SENTENCE, AND IT NARRATES THE THING BESIDE IT.

                The version this replaces was five lines of mechanism, and on a
                390px screen it pushed the product visual almost entirely below
                the fold: a visitor met a paragraph about a focus timer instead
                of seeing the plan being built. Mechanism belongs further down
                the page, where there is room to prove it.

                What is left is the shape of the story the card is telling right
                next to it, so the words and the picture say the same thing at
                the same moment.
              */}
            </div>

            <div className="order-2 lg:mt-6">
              {/*
                THE ARC IN ONE SENTENCE: plan, work, look back.

                Every verb here is a free, shipped surface. It deliberately does
                NOT say the app reminds you or keeps you on track - push and
                email reminders are not built on any tier, and the comparison
                table further down concedes that row on purpose. "Shows you
                where the time went" is the focus timer's recorded elapsed time,
                which is free and appears on the task row; the Pro claim is
                planned-versus-actual analysis, and that is marked where it is
                made.
              */}
              <p className="max-w-lg text-base leading-relaxed text-text-muted sm:text-lg">
                You have more to do than the day can hold. Todonado plans the part that fits, runs
                it in a focus timer, and shows you where the time went.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                {/*
                  NO HALO. `shadow-brand-glow` puts a 30px violet bloom under
                  this button, and an ink audit of the phone hero found the two
                  buttons carrying 79% of the headline's visual weight at 4.4
                  times its chroma: the most saturated object on the first
                  screen of a planning tool was a glowing bar. The brand fill
                  stays, because that is the product's signature and it is what
                  the app itself uses. The bloom goes, because it is the single
                  most recognisable "dark SaaS template" signal on the page and
                  it was winning a fight with the headline.
                */}
                <Button size="lg" onClick={startFree} className="cta-sheen shadow-none">
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
                {/*
                  A text link, not a second button. Two heavy buttons stacked on
                  a phone cost about sixty vertical pixels and split the intent;
                  the secondary action is for people who want to look before
                  they sign up, and a link is the honest weight for that.
                */}
                <SeeHowItWorks className="hidden sm:inline-flex" />
              </div>
            </div>

            {/*
              REASSURANCE, AND IT SITS AFTER THE PROOF ON A PHONE.

              Both of these answer an objection somebody has AFTER they have
              understood the offer, so on the narrowest screens they yield their
              place to the thing that does the understanding. From `sm` the link
              rejoins the button on one row and this block is microcopy alone,
              exactly as it reads on desktop.
            */}
            <div className="order-4 lg:mt-4">
              <SeeHowItWorks className="-ml-2 mb-2 flex w-fit sm:hidden" />
              <p className="text-sm text-text-muted">
                A complete day, free forever. No trial to expire, and no credit card.
              </p>
            </div>
            </div>

            {/* The story: ten obligations arrive, seven fit, they get done. */}
            <ProductShot className="order-3 lg:justify-self-end" />
          </div>
        </Section>

        {/* ═══════════════ 2 · WHY IT IS DIFFERENT ════════════════════════ */}
        <Section material="panel" ariaLabel="Why Todonado is different">
          <div className={CONTAINER}>
            <TwoColumnIntro
              eyebrow="01 · The difference"
              title="Most planners track what you owe. This one tracks the time you have."
              lede="A list will happily let you plan fourteen hours into an eight-hour day. These three are what stop it, and each one is what makes the next one possible."
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
              lede="Your day planner, focus timer, habit tracker and journal are all the same app. Everything below is live today, and the paid parts are marked Pro."
            />

            {/*
              THE CHIPS COME BEFORE THE MAP, NOT AFTER IT.

              They are the best ten-second summary in the section, and they used
              to sit at the BOTTOM, roughly 1,300px below the map on a phone, so
              a reader only met the summary after scrolling past everything it
              summarises. They also duplicated the lede word for word; the lede
              lost that half rather than the chips, because the chips are the
              shared constant /pricing renders too, and two surfaces stating a
              claim in identical words is what makes it checkable.
            */}
            <ul className="mt-7 flex flex-wrap gap-2">
              {ALL_IN_ONE_CATEGORIES.map((category) => (
                <li
                  key={category}
                  className="rounded-full border border-white/10 bg-surface px-3 py-1.5 text-xs text-text-muted"
                >
                  {category}
                </li>
              ))}
            </ul>

            <FeatureMap className="mt-8 border-t border-white/[0.07] pt-8 sm:mt-10 sm:pt-10" />
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
        {/*
          `data` for the COLOUR, with the texture switched off.

          The ruled grid is a 56px pitch anchored to the section's left edge,
          and 1152 is not a multiple of 56, so its vertical rules can never line
          up with the container at any width. Behind a table they ran through
          the cells at positions matching no column, which reads as broken cell
          borders. Dropping the material entirely was the wrong fix: this
          section sits between two panels, so it would have left two adjacent
          sections the same colour and destroyed the boundary between them. The
          base colour carries the alternation; only the texture goes.
        */}
        <Section
          material="data"
          id="compare"
          ariaLabel="How Todonado compares"
          className="[&::before]:hidden"
        >
          <div className={CONTAINER}>
            <TwoColumnIntro
              eyebrow="04 · Compare"
              title="Where this sits next to what you already use"
              lede="Most people are running three of these at once. None of them are bad tools; they just answer a different question."
            />
            <CategoryComparison className="mt-8 sm:mt-10" />
          </div>
        </Section>

        {/* ═══════════════ 6 · PRO, FREE VS PRO, PRICE ════════════════════ */}
        <Section material="premium" id="pricing" ariaLabel="Free and Pro">
          <div className={CONTAINER}>
            <SectionIntro
              eyebrow="05 · Free and Pro"
              title="Free is enough to run today. Pro adds the week ahead, and the look back."
              lede="Everything that makes one day work is free, and always will be. Pro is for planning further out than today, and seeing how your days really went."
              centered
            />

            <WhyPro className="mt-8 sm:mt-12" />

            <div className="mt-10 rounded-2xl border border-white/10 bg-background/60 p-4 sm:mt-14 sm:p-8">
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

            <div className="mx-auto mt-12 max-w-xl text-center sm:mt-16">
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
