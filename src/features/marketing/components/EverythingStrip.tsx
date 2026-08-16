import {
  BarChart3,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  Compass,
  Flag,
  Flame,
  HeartPulse,
  LayoutList,
  Network,
  NotebookPen,
  Play,
  Sprout,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Reveal } from '../demo/Reveal'
import { SECTION_RHYTHM } from '../sectionRhythm'

interface Item {
  icon: LucideIcon
  label: string
  /** Three or four words. No sentences — the icons carry the rest. */
  blurb: string
}

/**
 * EVERYTHING HERE SHIPS TODAY. Nothing aspirational in this strip.
 *
 * That rule is load-bearing, and it is why the Quit tracker and Vision were held
 * back from this list until 2026-07-30 even though the code had shipped: their
 * tables were committed-but-unapplied migrations, so a visitor who signed up
 * would have found an honest "not switched on yet" page instead of the feature
 * the landing page promised. `20260730120000_quit_habits.sql` and
 * `20260730140000_vision_cards.sql` are now applied and live-verified (tables
 * present, anon reads `[]`, anon writes `42501`), so both are claimable.
 *
 * Anything added here in future must clear the same bar: not "the code is
 * merged" but "a stranger who signs up right now can use it".
 */
const ITEMS: Item[] = [
  { icon: Play, label: 'Get to work', blurb: 'One tap to start' },
  { icon: Timer, label: 'Focus & pomodoro', blurb: '25 minutes on, 5 off' },
  { icon: LayoutList, label: 'Templates', blurb: 'Ready-made lists with time estimates' },
  { icon: ClipboardCheck, label: 'Checklists', blurb: 'Repeat lists, no dates' },
  { icon: CalendarRange, label: 'Week planning', blurb: 'Seven days at once' },
  { icon: CalendarClock, label: 'Calendar', blurb: 'Meetings take time off your day' },
  { icon: Sprout, label: 'Quit tracker', blurb: 'Days since you stopped' },
  { icon: Compass, label: 'Vision', blurb: 'The goals behind your work' },
  { icon: BarChart3, label: 'Insights', blurb: 'Planned versus actual' },
  { icon: Flame, label: 'Streaks', blurb: 'Gentle, never shaming' },
  { icon: HeartPulse, label: 'Focus & Calm', blurb: 'Breathwork and tracking' },
  // These three waited here while their migrations were pending, for the reason
  // at the top of this file: a visitor who signed up would have found an honest
  // "not switched on yet" page instead of the feature the strip promised.
  // `20260731120000_mind_maps`, `20260731130000_user_challenges` and
  // `20260731140000_journal_entries` are now applied and live-verified (tables
  // present, anon reads `[]`, anon writes `42501`), so all three are claimable.
  { icon: Network, label: 'Mind maps', blurb: 'Think it out first' },
  { icon: NotebookPen, label: 'Journal', blurb: 'How today went' },
  { icon: Flag, label: 'Challenges', blurb: 'Try something for seven days' },
]

export function EverythingStrip() {
  return (
    <section className="border-y border-white/5 bg-surface/30" aria-labelledby="everything">
      <div className={cn(SECTION_RHYTHM, 'max-w-6xl')}>
        <Reveal className="mx-auto max-w-2xl text-center">
          {/* The BREADTH claim belongs to OnePlaceStrip, which groups the
              surfaces by the job they do and links into each one, and to
              SystemLoop, which explains why they share a product. This section
              went back to its narrower original job — the flat "and also…"
              list — so the three no longer say the same thing three times. */}
          <h2 id="everything" className="font-display text-2xl font-bold sm:text-3xl">
            Everything else you&rsquo;d expect
          </h2>
          <p className="mt-3 text-sm text-text-muted">
            All of it included, on every plan unless a line says otherwise.
          </p>
        </Reveal>

        {/*
          A DENSE LIST, NOT FOURTEEN CARDS.

          This was fourteen bordered cards in a grid, immediately after two
          other card grids, and the run of them read as filler no matter how
          true each line was. Stripping the chrome to a hairline-ruled list
          removes roughly a screen of height, stops the page's third card wall,
          and lets this section do the only job it has: completeness.
        */}
        <ul className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-x-10 sm:grid-cols-2">
          {ITEMS.map(({ icon: Icon, label, blurb }, i) => (
            <li key={label} className="border-b border-white/5">
              <Reveal delay={Math.min(i, 8) * 40}>
                <div className="flex items-center gap-3 py-3">
                  <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                  <p className="shrink-0 text-sm font-medium text-text-primary">{label}</p>
                  <p className="min-w-0 flex-1 truncate text-right text-xs text-text-muted">
                    {blurb}
                  </p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
