import {
  BarChart3,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  Flame,
  HeartPulse,
  LayoutList,
  Play,
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
 * That rule is why the Quit tracker and Vision are NOT listed even though both
 * are built: their tables ship as committed-but-unapplied migrations, so a
 * visitor who signed up today would find an honest "not switched on yet" page
 * instead of the feature this strip promised.
 *
 * ONCE `20260730120000_quit_habits.sql` AND `20260730140000_vision_cards.sql`
 * HAVE BEEN APPLIED, add exactly these two lines:
 *   { icon: Sprout, label: 'Quit tracker', blurb: 'Days since you stopped' },
 *   { icon: Compass, label: 'Vision', blurb: 'The goals behind it' },
 * (and import Sprout + Compass from lucide-react.)
 */
const ITEMS: Item[] = [
  { icon: Play, label: 'Get to work', blurb: 'One tap to start' },
  { icon: Timer, label: 'Focus & pomodoro', blurb: '25/5, breaks included' },
  { icon: LayoutList, label: 'Templates', blurb: 'Ready-made, effort-tagged lists' },
  { icon: ClipboardCheck, label: 'Checklists', blurb: 'Repeat lists, no dates' },
  { icon: CalendarRange, label: 'Week planning', blurb: 'Seven days at once' },
  { icon: CalendarClock, label: 'Calendar-aware', blurb: 'Meetings shrink capacity' },
  { icon: BarChart3, label: 'Insights', blurb: 'Planned versus actual' },
  { icon: Flame, label: 'Streaks', blurb: 'Gentle, never shaming' },
  { icon: HeartPulse, label: 'Focus & Calm', blurb: 'Breathwork and tracking' },
]

export function EverythingStrip() {
  return (
    <section className="border-y border-white/5 bg-surface/30" aria-labelledby="everything">
      <div className={cn(SECTION_RHYTHM, 'max-w-6xl')}>
        <Reveal>
          <h2 id="everything" className="text-center font-display text-2xl font-bold sm:text-3xl">
            Your day, your focus, your habits &mdash; one place
          </h2>
          {/* Breadth, stated as a fact rather than as a comparison. No named
              competitors and no "replaces N apps": the list below is the claim. */}
          <p className="mx-auto mt-3 max-w-xl text-center text-text-muted">
            Not five apps stitched together. One that already does this.
          </p>
        </Reveal>

        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {ITEMS.map(({ icon: Icon, label, blurb }, i) => (
            <li key={label}>
              <Reveal delay={i * 60} direction="scale" className="h-full">
                <div className="flex h-full items-start gap-3 rounded-2xl border border-white/5 bg-surface/60 p-4 transition-colors hover:border-brand/25 sm:items-center sm:p-5">
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
