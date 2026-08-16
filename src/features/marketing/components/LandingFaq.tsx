import { ChevronDown } from 'lucide-react'

interface Qa {
  q: string
  a: string
}

/*
 * HONEST ANSWERS ONLY — every claim here reflects what the app does today.
 *
 * Two answers were wrong and are corrected below. "A future Pro tier" was
 * untrue: Pro is a real tier with real gates in the code right now (Week,
 * Insights, unlimited history, live calendar sync, the smart briefing layer).
 * And the free answer listed six features when free is most of the product —
 * under-selling is its own kind of inaccuracy.
 */
const FAQ: Qa[] = [
  {
    q: 'Is Todonado free?',
    a: 'Most of it, permanently. The capacity meter and its overbooking warning, “Plan my day”, unfinished work rolling to tomorrow, focus mode with Pomodoro, repeating tasks, the templates and checklists, breathwork and the quit tracker are all free. That is a complete day, not a trial. Pro adds the week ahead and a look back at how your days really went, and you can upgrade anytime from your plan settings.',
  },
  {
    q: 'What do I get with Pro?',
    a: 'The week ahead, and a look back at how your days really went. Week planning shows seven days at once, each with its own capacity, plus a one-tap “Plan my week”. Insights compare the time you planned with the time you actually spent, and show how accurate your estimates are getting. Pro also keeps your finished tasks forever instead of the last 14 days, keeps a linked calendar up to date so your meetings always show, and gives you a morning briefing with the day already planned.',
  },
  {
    q: 'What isn’t built yet?',
    a: 'Two things, and both are on their way. Recorded nature sounds and guided meditation: rain, thunder, ocean and the spoken sessions all need audio we have not licensed yet. Referral discount codes: billing has to go live first, and until then the share link already works. Sleep sounds itself works now, because white, pink and brown noise are generated on your device rather than downloaded. Everything else on this page you can use right now.',
  },
  {
    q: 'Does it work on my phone?',
    a: 'Yes. Todonado runs in your browser, and you can add it to your home screen so it opens like any other app. There is nothing to download from an app store. Plan on your laptop, work from your phone. Same account either way.',
  },
  {
    q: 'Is my data private?',
    a: 'Your tasks are yours. Your data is locked to your account inside the database, so no one else can read it. You can export everything, or permanently delete your account and its data, from Settings at any time.',
  },
]

/**
 * COLLAPSED BY DEFAULT, AND NATIVE.
 *
 * Five answers stacked open ran to roughly 1,500px on a phone, this far down a
 * page that is already long, to answer questions most readers only have one of.
 * The QUESTIONS are the scannable part: a visitor wants to spot "Is it free?"
 * and open that one. Collapsed, the whole section is five readable lines.
 *
 * `<details>` / `<summary>` rather than a hand-rolled accordion, deliberately.
 * It is keyboard operable, correctly announced, and open-able with no
 * JavaScript at all, which matters more here than anywhere else on the page:
 * these are the answers somebody goes looking for when they are deciding
 * whether to trust the product.
 *
 * The answers stay in the DOM when closed, so the marketing truth-pass in
 * `e2e/marketing.spec.ts` still scans every word of them.
 */
export function LandingFaq() {
  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6" aria-labelledby="faq">
      <h2 id="faq" className="text-center font-display text-2xl font-bold sm:text-3xl">
        Questions, answered
      </h2>
      <div className="mt-10 divide-y divide-white/5 border-y border-white/5">
        {FAQ.map((item) => (
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
    </section>
  )
}
