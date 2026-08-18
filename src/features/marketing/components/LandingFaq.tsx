import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { HOMEPAGE_FAQ } from '../faq'

/**
 * THREE QUESTIONS, AND A LINK TO THE REST.
 *
 * A previous pass kept all five here and wrote down why: two of the answers
 * existed nowhere else on the public site, so cutting them would have deleted
 * information rather than compressed a page. That was correct at the time.
 *
 * It is no longer the trade, because the full set now lives on `/pricing`
 * (`../faq.ts` is the single source both render from, so they cannot drift).
 * What is left here is the three a stranger asks BEFORE they will look at a
 * price — is it free, what does paying buy, can I get out — which is also the
 * only part of an FAQ that does conversion work on a homepage. The rest are
 * questions people have once they are already interested, and `/pricing` is
 * where they are standing when they have them.
 *
 * COLLAPSED BY DEFAULT, AND NATIVE. `details`/`summary` rather than a
 * hand-rolled accordion: it is keyboard-operable, announces its own expanded
 * state, is findable by the browser's in-page search even while closed, and
 * works with no JavaScript running.
 */
export function LandingFaq() {
  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6" aria-labelledby="faq">
      <h2 id="faq" className="text-center font-display text-xl font-bold sm:text-2xl">
        Questions, answered
      </h2>

      <div className="mt-6 divide-y divide-white/5 border-y border-white/5 sm:mt-8">
        {HOMEPAGE_FAQ.map((item, index) => (
          /*
           * THE FIRST ONE IS OPEN.
           *
           * An audit of the live page found that the FAQ rendered three
           * question titles and not one word of an answer, so a visitor who
           * never clicks anything learns only that questions exist. Opening the
           * first one costs about a hundred pixels and proves there are real
           * answers behind the other two, which is the whole reason the section
           * is on the page.
           *
           * `open` on `details` is the native attribute, so this stays
           * keyboard-operable and collapsible exactly as before.
           */
          <details key={item.q} className="group" open={index === 0}>
            <summary className="focus-ring flex min-h-[56px] cursor-pointer list-none items-center gap-3 py-4 text-left font-display text-base font-semibold text-text-primary marker:content-['']">
              <span className="flex-1">{item.q}</span>
              {/* Rotates on open. Decorative: `details` already reports its own
                  expanded state to assistive tech, so an aria-label here would
                  duplicate it. */}
              <ChevronDown
                aria-hidden
                className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <p className="pb-5 pr-7 text-sm leading-relaxed text-text-muted">{item.a}</p>
          </details>
        ))}
      </div>

      {/* `mt-1.5`, down from `mt-5`, and that is arithmetic rather than a
          design tweak. The link below became a real 44px box, which adds about
          13px of its own space above the text; trimming the same amount off
          this margin leaves the words exactly where they were on screen. The
          touch target grew, the layout did not move. */}
      <p className="mt-1.5 text-center text-sm">
        {/*
          `inline-flex min-h-[44px] items-center` is the touch target, not a
          style.

          Live production measured this link at 162x17 CSS px. That is under
          Todonado's own 44px floor and under the WCAG 2.2 SC 2.5.8 AA minimum
          of 24x24, so it was a conformance failure rather than a preference.
          It arrived with the FAQ split, where the homepage dropped to three
          questions and gained this link to the full set.

          `tap-h-44` was NOT used, and the reason is worth keeping: that
          utility grows the hit area with an absolutely positioned
          pseudo-element, which works for a control with space around it and
          fails for text in a paragraph, because the taller band lands on the
          lines above and below. Here the link owns its line, so giving the box
          a real height is both simpler and actually hit-testable.

          Nothing visual changes: no background, no border, same text at the
          same size, still centred by the parent, same destination. Only the
          box the finger can land on is bigger. This is the same treatment
          "Compare all plans" already uses in PricingTeaser.
        */}
        <Link
          to="/pricing#faq"
          className="focus-ring inline-flex min-h-[44px] items-center rounded px-3 text-accent underline-offset-4 hover:underline"
        >
          See all pricing questions
        </Link>
      </p>
    </section>
  )
}
