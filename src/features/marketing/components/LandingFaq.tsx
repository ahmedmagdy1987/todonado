interface Qa {
  q: string
  a: string
}

// Honest answers only — every claim reflects what the app actually does today.
const FAQ: Qa[] = [
  {
    q: 'Is Todonado free?',
    a: 'Yes. Capture, projects and subtasks, the effort-aware Today meter, roll-over, focus mode, and recurring tasks are all free to use. A future Pro tier adds deeper Insights — and nothing is charged today.',
  },
  {
    q: 'What do I get with Pro?',
    a: 'Pro is about insight over time: planned-vs-actual effort, how accurate your estimates are, and your focus and roll-over trends — the data that makes each week’s planning sharper. Day-to-day planning stays free.',
  },
  {
    q: 'Does it work on my phone?',
    a: 'Yes. Todonado is a dark, mobile-first web app you can add to your home screen and run like a native app — no app store. Plan on a laptop, execute on your phone; it’s the same account either way.',
  },
  {
    q: 'Is my data private?',
    a: 'Your tasks are yours. Every row is protected by database row-level security, so only you can read your own data — and you can export everything, or permanently delete your account and its data, from Settings at any time.',
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
          <div key={item.q} className="rounded-2xl border border-white/5 bg-surface/40 p-5">
            <dt className="font-display text-base font-semibold text-text-primary">{item.q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-text-muted">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
