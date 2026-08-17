import { Gauge, PlayCircle, TrendingUp, type LucideIcon } from 'lucide-react'
import { Reveal } from '../demo/Reveal'

/**
 * "WHAT IS ACTUALLY DIFFERENT ABOUT THIS?", ANSWERED IN ABOUT TEN SECONDS.
 *
 * ── THE GAP THIS FILLS ─────────────────────────────────────────────────────
 *
 * The page could previously only answer that question by being READ: the
 * argument was distributed across five chapters of storytelling and four
 * interactive demos, and a visitor who scrolled without stopping to play with
 * anything reached the price having formed no clear idea of what the product
 * was. The demos are good and they stay, but they are now PROOF of a claim
 * that has already been made in words, rather than the only place the claim
 * exists.
 *
 * ── WHY THESE THREE, IN THIS ORDER ─────────────────────────────────────────
 *
 * They are a chain, not a list, and the order is the causation: minutes make
 * capacity possible, capacity makes a plan worth starting, and starting
 * produces the real numbers that improve the next estimate. Any other order
 * describes three features. This order describes one system, which is the
 * actual claim.
 *
 * Every line is a shipped, free capability, verified against code in
 * docs/PRODUCT_VALUE_AUDIT.md. Nothing here is Pro, which is the point: the
 * differentiator is not the thing behind the paywall.
 */

interface Point {
  icon: LucideIcon
  step: string
  title: string
  body: string
  /** The concrete mechanism, so the claim is checkable rather than a slogan. */
  proof: string
}

const POINTS: Point[] = [
  {
    icon: Gauge,
    step: '01',
    title: 'Your day has a limit, and the app knows the number',
    body: 'Tasks carry how long they will really take. Todonado adds up what you have scheduled and measures it against the hours you actually have, meetings included.',
    proof: 'Warns you before you commit, not at 6pm.',
  },
  {
    icon: PlayCircle,
    step: '02',
    title: 'The plan is the thing you start',
    body: 'A planned task is one tap from a running timer. No copying today into another app, no deciding twice what to work on.',
    proof: 'Plan, then focus, in the same place.',
  },
  {
    icon: TrendingUp,
    step: '03',
    title: 'What really happened comes back to you',
    body: 'Real time is recorded against the work, so you find out that your “thirty minutes” is usually fifty, and tomorrow gets planned on the truth instead of the hope.',
    proof: 'Your estimates get better because they are measured.',
  },
]

export function Differentiators() {
  return (
    <>
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Why it is different</p>
        <h2
          id="why-different"
          className="mt-3 font-display text-2xl font-bold leading-[1.1] tracking-tight sm:text-3xl lg:text-4xl"
        >
          Most planners track what you owe.
          <span className="mt-1 block text-gradient-brand">This one tracks what you have.</span>
        </h2>
        <p className="mt-4 text-base leading-relaxed text-text-muted">
          A list can grow forever. A day cannot. Everything below follows from taking that
          seriously.
        </p>
      </div>

      {/*
        Three columns on desktop, stacked on a phone. Deliberately NOT a bento
        or a card grid: these are three stages of one process, so they are
        numbered and share a baseline, which reads as a sequence rather than as
        three unrelated selling points sitting in three boxes.
      */}
      <ol className="mt-10 grid gap-5 sm:mt-14 lg:grid-cols-3 lg:gap-6">
        {POINTS.map(({ icon: Icon, step, title, body, proof }, i) => (
          <li key={step}>
            <Reveal delay={i * 70}>
              <div className="flex h-full flex-col rounded-2xl border border-white/8 bg-surface-2/60 p-6 lg:p-7">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="font-mono text-xs tracking-[0.18em] text-text-muted/70">
                    {step}
                  </span>
                </div>

                <h3 className="mt-5 font-display text-lg font-semibold leading-snug">{title}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-text-muted">{body}</p>

                <p className="mt-5 border-t border-white/8 pt-4 text-sm font-medium text-text-primary">
                  {proof}
                </p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </>
  )
}
