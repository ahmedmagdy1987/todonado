import { Reveal } from '../demo/Reveal'

/**
 * THREE STEPS, AND IT MUST STAY THREE.
 *
 * ── WHY THIS IS SHORT ON PURPOSE ───────────────────────────────────────────
 *
 * "How it works" is the section most likely to grow, because every feature has
 * a plausible claim on being a step. The previous page's answer to this
 * question was an animated system loop plus four interactive demos, roughly
 * 2,600px of scrolling, which is a walkthrough rather than an explanation. A
 * visitor at this point in the page does not want to be taught the product;
 * they want to confirm it is not complicated. Three lines does that. The
 * demos further down are where somebody who wants more can go and get it.
 *
 * The real product screenshot carries the weight here, because a picture of
 * the actual Today screen answers "what will this look like" faster than any
 * amount of prose, and it is the one thing the previous page never showed.
 */

const STEPS = [
  {
    n: '1',
    title: 'Write it all down',
    body: 'Everything, in one inbox. Give each thing a rough number of minutes, or take the estimate it suggests.',
  },
  {
    n: '2',
    title: 'See what actually fits',
    body: 'Pick the day, and Todonado adds it up against your real hours. Overbook it and it says so, before you have promised anything.',
  },
  {
    n: '3',
    title: 'Work it, and let it correct you',
    body: 'Start the timer on what you planned. Whatever you do not finish moves forward, and what it really took feeds the next estimate.',
  },
] as const

export function HowItWorks() {
  return (
    <>
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">How it works</p>
        <h2
          id="how-it-works-title"
          className="mt-3 font-display text-2xl font-bold leading-[1.1] tracking-tight sm:text-3xl lg:text-4xl"
        >
          Three steps, every morning
        </h2>
        <p className="mt-4 text-base leading-relaxed text-text-muted">
          It takes about two minutes, and it is the same two minutes every day.
        </p>
      </div>

      <div className="mt-10 grid items-center gap-10 sm:mt-14 lg:grid-cols-2 lg:gap-14">
        <ol className="space-y-6">
          {STEPS.map(({ n, title, body }, i) => (
            <li key={n}>
              <Reveal delay={i * 70}>
                <div className="flex gap-4">
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand/40 bg-brand/10 font-mono text-sm font-semibold text-brand"
                  >
                    {n}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{body}</p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>

        {/*
          THE REAL SCREEN, NOT AN ILLUSTRATION.
          `public/shots/today-desktop.png` has been in the repo unused: a grep
          for "shots/" across src returned nothing before this. A product that
          will not show its own interface reads as a product that is not built.

          Sized and lazy: it is below the fold on every width, and `width`/
          `height` are set so it reserves its space and cannot shift the layout
          when it arrives.
        */}
        <Reveal direction="scale" delay={120}>
          <figure className="overflow-hidden rounded-2xl border border-white/10 bg-background shadow-elevation-lg">
            <img
              src="/shots/today-desktop.png"
              alt="The Today screen: a list of tasks scheduled for the day above a capacity meter showing how much of the day is already planned."
              width={1600}
              height={1000}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
          </figure>
        </Reveal>
      </div>
    </>
  )
}
