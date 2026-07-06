import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CalendarClock, CalendarRange, CheckCircle2, Crosshair, Flame, Target, Timer, Trophy } from 'lucide-react'
import { Card } from '@/components/ui'
import { formatDateShort, formatMinutes } from '@/lib/format'
import type { WeeklyReview as WeeklyReviewData } from '../weeklyReview'
import { WEEKLY_MIN_DAYS } from '../weeklyReview'
import { InsightBarChart } from './InsightBarChart'
import { StatTile } from './StatTile'
import { TONE } from './chartTones'

function deltaMinutes(delta: number): string {
  if (delta === 0) return 'same as last week'
  return `${delta > 0 ? '+' : '−'}${formatMinutes(Math.abs(delta))} vs last week`
}

function deltaPoints(delta: number | null): string | undefined {
  if (delta == null) return undefined
  const pts = Math.round(delta * 100)
  if (pts === 0) return 'same as last week'
  return `${pts > 0 ? '+' : '−'}${Math.abs(pts)} pts vs last week`
}

function Chip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-2/40 px-3 py-1.5 text-xs text-text-primary">
      <Icon className="h-3.5 w-3.5 text-brand" aria-hidden />
      {children}
    </span>
  )
}

export function WeeklyReview({ weekly }: { weekly: WeeklyReviewData }) {
  const { thisWeek, lastWeek, daily, bestDay, streak, bias, focusDeltaMinutes, completionRateDelta } = weekly
  const range =
    daily.length > 0
      ? `${formatDateShort(daily[0].date)} – ${formatDateShort(daily[daily.length - 1].date)}`
      : ''

  const effortPoints = daily.map((d) => ({
    label: formatDateShort(d.date),
    primary: d.plannedMinutes,
    secondary: d.completedMinutes,
    tone: 'brand' as const,
  }))

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
          <CalendarRange className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold">Your week</h3>
          <p className="text-sm text-text-muted">This week vs last{range && ` · ${range}`}</p>
        </div>
      </div>

      {!weekly.hasEnoughData ? (
        <p className="text-sm text-text-muted">
          Your weekly review is warming up — {weekly.daysLogged} of {WEEKLY_MIN_DAYS} days logged this
          week. Keep planning and running focus sessions, and your this-week-vs-last-week rollup will
          fill in here. No pressure — every planned day counts.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              icon={CalendarClock}
              label="Planned"
              value={formatMinutes(thisWeek.plannedMinutes)}
              sub={deltaMinutes(thisWeek.plannedMinutes - lastWeek.plannedMinutes)}
            />
            <StatTile
              icon={CheckCircle2}
              label="Completed"
              value={formatMinutes(thisWeek.completedMinutes)}
              sub={`${thisWeek.completedCount} ${thisWeek.completedCount === 1 ? 'task' : 'tasks'} done`}
            />
            <StatTile
              icon={Timer}
              label="Focus time"
              value={formatMinutes(thisWeek.focusMinutes)}
              sub={deltaMinutes(focusDeltaMinutes)}
            />
            <StatTile
              icon={Target}
              label="Completion"
              value={thisWeek.completionRate != null ? `${Math.round(thisWeek.completionRate * 100)}%` : '—'}
              sub={deltaPoints(completionRateDelta) ?? 'planned effort done'}
            />
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
              Planned vs completed, day by day
            </p>
            <InsightBarChart
              points={effortPoints}
              format={formatMinutes}
              heightClass="h-28"
              ariaLabel="Planned versus completed effort per day this week"
            />
            <div className="mt-3 flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                <span className={`h-2.5 w-2.5 rounded-sm ${TONE.brand.track}`} aria-hidden /> Planned
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                <span className={`h-2.5 w-2.5 rounded-sm ${TONE.brand.fill}`} aria-hidden /> Completed
              </span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {bestDay && (
              <Chip icon={Trophy}>
                Best day: {formatDateShort(bestDay.date)} · {formatMinutes(bestDay.completedMinutes)} done
              </Chip>
            )}
            {streak.count >= 1 && (
              <Chip icon={Flame}>
                {streak.count}-day planning streak{streak.includesToday ? '' : ' — plan today to keep it'}
              </Chip>
            )}
            {bias.hasEnough && bias.biasPct != null && bias.direction !== 'accurate' && (
              <Chip icon={Crosshair}>
                Estimates run ~{Math.abs(bias.biasPct)}% {bias.direction === 'under' ? 'short' : 'long'}
              </Chip>
            )}
            {bias.hasEnough && bias.direction === 'accurate' && (
              <Chip icon={Crosshair}>Estimates on the mark</Chip>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
