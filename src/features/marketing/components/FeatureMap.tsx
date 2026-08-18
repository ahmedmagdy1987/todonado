import { cn } from '@/lib/utils'
import { FREE_HISTORY_DAYS } from '@/lib/config'

/**
 * WHAT IS ACTUALLY INSIDE TODONADO, VISIBLE IN ONE SCREEN.
 *
 * ── WHY A RULED COLUMN MAP AND NOT A BENTO GRID OR TABS ────────────────────
 *
 * The claim this section has to support is breadth: one app instead of several.
 * Only one layout actually supports that claim.
 *
 * TABS are structurally wrong for it. They hide every category but one behind a
 * click, so a visitor who reads for ten seconds sees a fifth of the product and
 * concludes that is the product. A breadth claim presented as tabs argues
 * against itself.
 *
 * BENTO is worse than it looks on a phone. Bento's meaning IS the size
 * relationship between tiles, and collapsing to one column makes every tile the
 * same width, which deletes the hierarchy that carried the meaning and leaves a
 * long stack of identical cards: more scroll for less information. Since mobile
 * is the primary surface here, that disqualifies it.
 *
 * A ruled column map shows every group simultaneously, has the highest
 * information-per-pixel of the formats considered, and degrades honestly:
 * columns become stacked groups, vertical rules become horizontal ones, and
 * nothing is lost or hidden at any width.
 *
 * ── EVERY LINE IS A ROUTE A SIGNED-UP USER CAN OPEN ────────────────────────
 *
 * Nothing aspirational, nothing behind an off flag. Where a capability is paid
 * it says so inline, because a breadth list that quietly counts paid features
 * as included is the same dishonesty as a comparison table with no losses.
 *
 * The wording matches the product's own vocabulary rather than marketing
 * invention: it is "Quit tracker", not "quit habits"; "My templates", not
 * "personal templates"; "Day Capacity", not "time budget". A visitor who signs
 * up should recognise every word from this list inside the app.
 *
 * ── THE LABELS ARE PLAIN, NOT ELEGANT ──────────────────────────────────────
 *
 * The fifth column was called "Keep going", which reads nicely and tells a
 * stranger nothing. A feature inventory is the one place on a landing page
 * where a heading has to be literal, because the reader is scanning for
 * something they already want rather than being told a story. "Capture" went
 * the same way: it named the first thing you do rather than what the column
 * contains, which is the whole structure of your work. So the columns are now
 * Organize, Plan, Focus, Learn, Reflect and Wellbeing.
 *
 * ── AND THEY HOLD WHAT THEY SAY THEY HOLD ──────────────────────────────────
 *
 * Two items were filed by accident rather than by meaning: calendar file import
 * sat under Focus and live calendar sync under Learn, when both are how
 * meetings take real time out of a plan. They are one Plan item now. Six
 * columns rather than five also stop the grid squeezing to 215px a column on a
 * desktop, which was making the longer labels wrap.
 */

interface Pillar {
  name: string
  /** One line on what this group of the product is for. */
  summary: string
  items: readonly { label: string; pro?: boolean }[]
}

export const PILLARS: readonly Pillar[] = [
  {
    name: 'Organize',
    summary: 'Everything you owe, in a shape you can work from.',
    items: [
      { label: 'Inbox' },
      { label: 'Projects, sections and subtasks' },
      { label: 'Priorities and drag to reorder' },
      { label: 'Repeating tasks' },
      { label: 'Templates and checklists' },
      { label: 'My templates' },
    ],
  },
  {
    name: 'Plan',
    summary: 'Decide what actually fits before the day starts.',
    items: [
      { label: 'Today, your command center' },
      { label: 'Day Capacity meter' },
      { label: 'Overbooking guard' },
      { label: 'Plan my day' },
      { label: 'Roll-over, with undo' },
      { label: 'Calendar file import' },
      { label: 'Live calendar sync', pro: true },
      { label: 'Week board and Plan my week', pro: true },
    ],
  },
  {
    name: 'Focus',
    summary: 'Turn the plan into work, one task at a time.',
    items: [
      { label: 'Get to work' },
      { label: 'Focus timer' },
      { label: 'Pomodoro rhythm' },
      { label: 'Interruption log' },
      { label: 'Time actually spent' },
      { label: 'Sounds and end chime' },
    ],
  },
  {
    name: 'Progress',
    summary: 'The numbers, computed from what you actually did.',
    items: [
      { label: 'Daily briefing' },
      { label: 'Planning streak and points' },
      { label: `Completed history, ${FREE_HISTORY_DAYS} days free` },
      { label: 'Insights', pro: true },
      { label: 'Estimation accuracy', pro: true },
      { label: 'Weekly review', pro: true },
    ],
  },
  {
    name: 'Reflect',
    summary: 'Your own words, and the goals behind the work.',
    items: [
      { label: 'Journal' },
      { label: 'Voice notes', pro: true },
      { label: 'Vision' },
      { label: 'Mind maps' },
    ],
  },
  {
    name: 'Wellbeing',
    summary: 'Habits you are breaking, and a way to wind down.',
    items: [
      { label: 'Quit tracker' },
      { label: 'Challenges' },
      { label: 'Breathwork' },
      { label: 'Sleep noise' },
      { label: 'Supplement and medication log' },
    ],
  },
] as const

/** Every capability named on the map. Used by the tests and the report. */
export const FEATURE_COUNT = PILLARS.reduce((n, pillar) => n + pillar.items.length, 0)

export function FeatureMap({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {PILLARS.map((pillar) => (
        <div
          key={pillar.name}
          /*
           * The vertical rule only exists at the width where all five columns
           * share one row. Below that the columns wrap, and a left border on a
           * wrapped item draws a rule in the middle of nothing.
           */
          className="lg:border-l lg:border-white/[0.07] lg:pl-6 lg:[&:nth-child(3n+1)]:border-l-0 lg:[&:nth-child(3n+1)]:pl-0"
        >
          <h3 className="font-display text-base font-semibold text-text-primary">{pillar.name}</h3>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">{pillar.summary}</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-3.5 gap-y-1.5 border-t border-white/[0.07] pt-3 sm:block sm:space-y-1.5">
            {pillar.items.map((item) => (
              <li key={item.label} className="flex items-baseline gap-2 text-sm text-text-primary">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand/70" />
                <span className="min-w-0">
                  {item.label}
                  {item.pro && (
                    <>
                      {/*
                        A REAL SPACE, then a pill.

                        Without the explicit space the accessible name of the
                        row concatenates to "InsightsPro". And the badge used to
                        be 10px brand violet directly on the page background,
                        which measures 4.00:1 against #0A0D16 and fails WCAG AA
                        for normal text. It is the text that separates included
                        from costs-extra, so it is the last thing that should be
                        hard to read. Raising the local background keeps the
                        brand identity and clears the ratio comfortably.
                      */}
                      {' '}
                      <span className="ml-0.5 whitespace-nowrap rounded bg-brand/25 px-1.5 py-px font-mono text-[11px] uppercase tracking-wider text-text-primary">
                        Pro
                        <span className="sr-only"> plan only</span>
                      </span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
