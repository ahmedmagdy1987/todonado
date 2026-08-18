import { cn } from '@/lib/utils'

/**
 * THE ANSWER TO "WHAT IS ACTUALLY DIFFERENT ABOUT THIS?"
 *
 * ── THREE CLAIMS, IN CAUSAL ORDER ──────────────────────────────────────────
 *
 * Not three selling points. Each one is the reason the next is possible: tasks
 * carry minutes, so a day can have a limit; the day you planned is the day you
 * work, so the time spent lands on the task you planned; and having both
 * numbers is what lets the next plan be better than the last.
 *
 * That ordering is the argument. A capacity meter on its own is a widget any
 * product could add in a week, and claiming it as unique would be both weak and
 * untrue. The thing that is genuinely hard to copy is that all three steps are
 * the same system, which is why this is a numbered list rather than three cards
 * in a row: cards imply "pick your favourite", a sequence implies consequence.
 *
 * Every capability named here is FREE, which matters for where this sits on the
 * page. The first thing a visitor learns about the product should not be
 * something they would have to pay for.
 */

interface Differentiator {
  title: string
  body: string
  /** The concrete mechanism, stated so the claim is checkable. */
  proof: string
}

export const DIFFERENTIATORS: readonly Differentiator[] = [
  {
    title: 'Your day has a real limit',
    body: 'Every task can carry an estimate in minutes, and your day carries a capacity. Todonado tells you what actually fits before the day starts, rather than at nine in the evening.',
    proof: 'Day Capacity meter and overbooking guard',
  },
  {
    title: 'The plan is the thing you work',
    body: 'The day you planned is the day you start. Pick a task, start the timer, and the time you really spend is recorded against that task instead of disappearing.',
    proof: 'Focus and Pomodoro, on the task you planned',
  },
  {
    title: 'What really happened shapes the next plan',
    body: 'Planned time and actual time sit side by side, so you find out your thirty minutes is really fifty. Unfinished work rolls forward on purpose instead of piling up.',
    proof: 'Roll-over free, Insights on Pro',
  },
] as const

export function Differentiators({ className }: { className?: string }) {
  return (
    <ol className={cn('grid gap-px overflow-hidden rounded-2xl bg-white/[0.07] lg:grid-cols-3', className)}>
      {DIFFERENTIATORS.map((item, index) => (
        <li key={item.title} className="bg-surface p-5 lg:p-7">
          <p className="font-mono text-xs tracking-[0.18em] text-brand">
            {String(index + 1).padStart(2, '0')}
          </p>
          <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-text-primary">
            {item.title}
          </h3>
          <p className="mt-2.5 text-sm leading-relaxed text-text-muted">{item.body}</p>
          <p className="mt-4 border-t border-white/[0.07] pt-3 text-xs text-text-primary/70">
            {item.proof}
          </p>
        </li>
      ))}
    </ol>
  )
}
