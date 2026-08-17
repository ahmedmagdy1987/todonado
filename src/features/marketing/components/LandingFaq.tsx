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
        {HOMEPAGE_FAQ.map((item) => (
          <details key={item.q} className="group">
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

      <p className="mt-5 text-center text-sm">
        <Link
          to="/pricing#faq"
          className="focus-ring rounded text-accent underline-offset-4 hover:underline"
        >
          See all pricing questions
        </Link>
      </p>
    </section>
  )
}
