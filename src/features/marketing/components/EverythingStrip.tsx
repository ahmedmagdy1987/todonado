import {
  BarChart3,
  CalendarClock,
  Flame,
  HeartPulse,
  LayoutList,
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

/** Everything here ships today. Nothing aspirational in this strip. */
const ITEMS: Item[] = [
  { icon: LayoutList, label: 'Templates', blurb: 'Ready-made, effort-tagged lists' },
  { icon: Timer, label: 'Focus', blurb: 'Refresh-proof deep work' },
  { icon: BarChart3, label: 'Insights', blurb: 'Planned versus actual' },
  { icon: CalendarClock, label: 'Calendar-aware', blurb: 'Meetings shrink capacity' },
  { icon: Flame, label: 'Streaks', blurb: 'Gentle, never shaming' },
  { icon: HeartPulse, label: 'Focus & Calm', blurb: 'Breathwork and tracking' },
]

export function EverythingStrip() {
  return (
    <section className="border-y border-white/5 bg-surface/30" aria-labelledby="everything">
      <div className={cn(SECTION_RHYTHM, 'max-w-6xl')}>
        <Reveal>
          <h2 id="everything" className="text-center font-display text-2xl font-bold sm:text-3xl">
            Everything else you&rsquo;d expect
          </h2>
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
