import { cn } from '@/lib/utils'

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
 */

interface Pillar {
  name: string
  /** One line on what this group of the product is for. */
  summary: string
  items: readonly { label: string; pro?: boolean }[]
}

export const PILLARS: readonly Pillar[] = [
  {
    name: 'Capture',
    summary: 'Get it out of your head and into shape.',
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
      { label: 'Calendar file import' },
    ],
  },
  {
    name: 'Learn',
    summary: 'Let what really happened shape the next plan.',
    items: [
      { label: 'Daily briefing' },
      { label: 'Planning streak and points' },
      { label: 'Completed history' },
      { label: 'Insights', pro: true },
      { label: 'Estimation accuracy', pro: true },
      { label: 'Live calendar sync', pro: true },
    ],
  },
  {
    name: 'Keep going',
    summary: 'The parts that keep the system worth returning to.',
    items: [
      { label: 'Journal' },
      { label: 'Voice notes', pro: true },
      { label: 'Vision and mind maps' },
      { label: 'Challenges' },
      { label: 'Quit tracker' },
      { label: 'Breathwork and sleep noise' },
    ],
  },
] as const

/** Every capability named on the map. Used by the tests and the report. */
export const FEATURE_COUNT = PILLARS.reduce((n, pillar) => n + pillar.items.length, 0)

export function FeatureMap({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
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
          className="xl:border-l xl:border-white/[0.07] xl:pl-5 xl:first:border-l-0 xl:first:pl-0"
        >
          <h3 className="font-display text-base font-semibold text-text-primary">{pillar.name}</h3>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">{pillar.summary}</p>
          <ul className="mt-3 space-y-2 border-t border-white/[0.07] pt-3">
            {pillar.items.map((item) => (
              <li key={item.label} className="flex items-baseline gap-2 text-sm text-text-primary">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand/70" />
                <span className="min-w-0">
                  {item.label}
                  {item.pro && (
                    <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-brand">
                      Pro
                    </span>
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
