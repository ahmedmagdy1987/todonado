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
  { icon: Timer, label: 'Focus & pomodoro', blurb: '25/5, breaks included' },
  { icon: LayoutList, label: 'Templates', blurb: 'Ready-made, effort-tagged lists' },
  { icon: ClipboardCheck, label: 'Checklists', blurb: 'Repeat lists, no dates' },
  { icon: CalendarRange, label: 'Week planning', blurb: 'Seven days at once' },
  { icon: CalendarClock, label: 'Calendar-aware', blurb: 'Meetings shrink capacity' },
  { icon: Sprout, label: 'Quit tracker', blurb: 'Days since you stopped' },
  { icon: Compass, label: 'Vision', blurb: 'The goals behind it' },
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
  { icon: Flag, label: 'Challenges', blurb: 'A short, structured push' },
]

export function EverythingStrip() {
  return (
    <section className="border-y border-white/5 bg-surface/30" aria-labelledby="everything">
      <div className={cn(SECTION_RHYTHM, 'max-w-6xl')}>
        <Reveal>
          {/* The BREADTH claim now belongs to OnePlaceStrip, which groups the
              surfaces by the job they do and links into each one. This section
              went back to its narrower original job — the flat "and also…" list
              — so the two no longer say the same thing twice in a row. */}
          <h2 id="everything" className="text-center font-display text-2xl font-bold sm:text-3xl">
            Everything else you&rsquo;d expect
          </h2>
        </Reveal>

        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {ITEMS.map(({ icon: Icon, label, blurb }, i) => (
            <li key={label}>
              <Reveal delay={i * 60} direction="scale" className="h-full">
                <div className="lift-card flex h-full items-start gap-3 rounded-2xl border border-white/5 bg-surface/60 p-4 hover:border-brand/25 sm:items-center sm:p-5">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-sm font-semibold sm:text-base">{label}</p>
                    <p className="mt-0.5 text-xs text-text-muted sm:text-sm">{blurb}</p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
