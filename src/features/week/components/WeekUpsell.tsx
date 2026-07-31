import { Link } from 'react-router-dom'
import { CalendarRange, Sparkles } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { DEFAULT_DAILY_CAPACITY_MINUTES } from '@/lib/config'
import { formatMinutes } from '@/lib/format'
import { useAuth } from '@/features/auth/auth-context'
import { captureUpgradeIntent } from '@/features/marketing/api/upgradeIntents'
import { todayISO } from '@/lib/date'
import type { Task } from '@/types/database'
import { buildWeek, weekDates } from '../week'
import { DayColumn } from './DayColumn'

/**
 * What a Free user sees at /week.
 *
 * DELIBERATELY SAMPLE DATA, and labelled as such in the heading, a badge, and
 * every column. We do NOT render the user's real week blurred or locked behind a
 * scrim: teasing someone with their own data is the dark pattern this avoids.
 * They see exactly what the feature does, with made-up content, and can decide.
 */

const SAMPLE: { day: number; title: string; minutes: number }[] = [
  { day: 0, title: 'Draft the launch email', minutes: 60 },
  { day: 0, title: 'Review two pull requests', minutes: 45 },
  { day: 1, title: 'Customer calls', minutes: 90 },
  { day: 1, title: 'Update the changelog', minutes: 30 },
  { day: 2, title: 'Deep work: pricing spec', minutes: 120 },
  { day: 3, title: 'Team retro prep', minutes: 45 },
  { day: 4, title: 'Invoice run', minutes: 30 },
  { day: 4, title: 'Plan next sprint', minutes: 60 },
  { day: 6, title: 'Weekly review', minutes: 45 },
]

function sampleTask(index: number, date: string, title: string, minutes: number): Task {
  return {
    id: `sample-${index}`,
    workspace_id: 'sample',
    project_id: null,
    section_id: null,
    title,
    notes: null,
    status: 'todo',
    priority: 0,
    due_date: null,
    effort_minutes: minutes,
    scheduled_for: date,
    position: index,
    recurrence_freq: null,
    recurrence_interval: 1,
    recurrence_weekdays: null,
    recurrence_until: null,
    recurrence_anchor: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
  }
}

export function WeekUpsell() {
  const { user } = useAuth()
  const today = todayISO()
  const dates = weekDates(today)
  const tasks = SAMPLE.map((s, i) => sampleTask(i, dates[s.day], s.title, s.minutes))
  const days = buildWeek({
    todayStr: today,
    tasks,
    capacityMinutes: DEFAULT_DAILY_CAPACITY_MINUTES,
    // A couple of sample meetings so the calendar-aware meter is visible too.
    busyByDate: { [dates[1]]: 60, [dates[3]]: 90 },
  })

  function recordIntent() {
    void captureUpgradeIntent({
      tier: 'pro',
      userId: user?.id ?? null,
      email: user?.email ?? null,
      source: 'week_view',
    }).catch(() => {
      /* signal only */
    })
  }

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <CalendarRange className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold">Week planning</h2>
            <Badge variant="brand">Pro</Badge>
          </div>
          <p className="text-sm text-text-muted">
            Seven days, each with its own capacity meter. Drag work between days and let Todonado
            fill the week without overbooking a single one.
          </p>
        </div>
      </header>

      <div className="rounded-2xl border border-brand/25 bg-brand-gradient-soft p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Sparkles className="h-5 w-5 shrink-0 text-brand" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-text-primary">
            <strong className="font-medium">Plan your whole week — Pro.</strong>{' '}
            <span className="text-text-muted">
              Your Today view, roll-over, capacity meter and auto-plan stay free and unchanged.
            </span>
          </p>
          <Link to="/settings/plan" onClick={recordIntent}>
            <Button size="sm">See Pro</Button>
          </Link>
        </div>
      </div>

      <section aria-label="Sample week preview" className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-sm font-semibold text-text-muted">
            A sample week — made-up tasks, not yours
          </h3>
          <Badge variant="outline">Sample</Badge>
        </div>

        <div
          aria-hidden
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0"
        >
          {days.map((day) => (
            /*
              THE SAME WIDTH WRAPPER THE REAL BOARD USES, and it has to be here
              too. `DayColumn` is `w-full min-w-0` — deliberately, so it fills a
              grid cell at `lg` — which means that as a bare FLEX child it
              shrinks to its content. WeekPage wraps each column to stop that;
              this board rendered them raw, so between 640px and 1024px the
              seven sample columns collapsed to about 55px each: "Today" read
              "Toda", "1h in meetings" read "1h in mee", and every task card was
              two characters and an ellipsis.

              This is the board a FREE user sees — the one making the case for
              the paid feature — so it was the more visible of the two.
            */
            <div
              key={day.date}
              className="flex min-h-[24rem] min-w-[85vw] sm:min-h-[28rem] sm:min-w-[17rem] lg:min-h-0 lg:min-w-0"
            >
              <DayColumn day={day} interactive={false}>
                {day.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-xl border border-white/5 bg-surface-2/40 px-2.5 py-2"
                  >
                    <p className="truncate text-xs text-text-primary">{task.title}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-text-muted">
                      {formatMinutes(task.effort_minutes ?? 0)}
                    </p>
                  </div>
                ))}
              </DayColumn>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
