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
    a: 'Most of it, permanently. The effort-aware capacity meter, the overbooking guard, “Plan my day”, roll-over and recovery, focus mode with Pomodoro, recurring tasks, the template and checklist catalog, breathwork and the quit tracker are all free: that is the complete daily loop, not a trial. Nothing is charged today at all.',
  },
  {
    q: 'What do I get with Pro?',
    a: 'The week and the retrospective. Week planning puts seven days on one board, each with its own capacity, plus a one-tap “Plan my week”. Insights show planned-vs-actual effort and how accurate your estimates are getting. Pro also keeps your completed history forever instead of the last 14 days, syncs a calendar URL so meetings stay fresh, and turns the daily briefing into a plan that arrives already made.',
  },
  {
    q: 'What isn’t built yet?',
    a: 'Two things, and both are on their way. Recorded ambience and guided meditation: rain, thunder, ocean and the spoken sessions all need audio we have not licensed yet. Referral discount codes: billing has to go live first, and until then the share link already works. Sleep sounds itself works now, because white, pink and brown noise are generated on your device rather than downloaded. Everything else on this page you can use right now.',
  },
  {
    q: 'Does it work on my phone?',
    a: 'Yes. Todonado is a dark, mobile-first web app you can add to your home screen and run like a native app, no app store. Plan on a laptop, execute on your phone; it’s the same account either way.',
  },
  {
    q: 'Is my data private?',
    a: 'Your tasks are yours. Every row is protected by database row-level security, so only you can read your own data. You can export everything, or permanently delete your account and its data, from Settings at any time.',
  },
]

export function LandingFaq() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6" aria-labelledby="faq">
      <h2 id="faq" className="text-center font-display text-2xl font-bold sm:text-3xl">
        Questions, answered
      </h2>
      <dl className="mt-10 space-y-4">
        {FAQ.map((item) => (
          <div key={item.q} className="lift-card rounded-2xl border border-white/5 bg-surface/40 p-5 hover:border-brand/20">
            <dt className="font-display text-base font-semibold text-text-primary">{item.q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-text-muted">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
