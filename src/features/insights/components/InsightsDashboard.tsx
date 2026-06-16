import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CalendarClock,
  CheckCircle2,
  Gauge,
  RotateCcw,
  Target,
  Timer,
  TrendingUp,
} from 'lucide-react'
import { Card } from '@/components/ui'
import { formatDateShort, formatMinutes } from '@/lib/format'
import type { CapacityStatus } from '@/features/today/capacity'
import type { InsightsData } from '../insights'
import { InsightBarChart } from './InsightBarChart'
import { TONE, type ChartTone } from './chartTones'
import { StatTile } from './StatTile'

const STATUS_TONE: Record<CapacityStatus, ChartTone> = {
  empty: 'success',
  ok: 'success',
  near: 'warning',
  over: 'danger',
}

function Panel({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon
  title: string
  subtitle?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold">{title}</h3>
          {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  )
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
      <span className={`h-2.5 w-2.5 rounded-sm ${className}`} aria-hidden />
      {label}
    </span>
  )
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-surface-2/40 p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold text-text-primary">{value}</p>
      {sub && <p className="text-xs text-text-muted">{sub}</p>}
    </div>
  )
}

function NoPlanData({ windowDays }: { windowDays: number }) {
  return (
    <p className="text-sm text-text-muted">
      No planned effort in the last {windowDays} days. Schedule tasks with an effort estimate to see
      this trend build up.
    </p>
  )
}

export function InsightsDashboard({ data }: { data: InsightsData }) {
  const { daily, focus, rollover, summary } = data
  const hasPlanned = data.planningDays > 0
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
  const capacityPoints = daily.map((d) => ({
    label: formatDateShort(d.date),
    primary: d.capacityPct,
    tone: STATUS_TONE[d.status],
  }))
  const capacityMax = Math.max(100, ...daily.map((d) => d.capacityPct))
  const focusPoints = focus.daily.map((d) => ({
    label: formatDateShort(d.date),
    primary: d.minutes,
    tone: 'accent' as const,
  }))

  const focusMinutes = Math.round(focus.focusSeconds / 60)
  const summaryFocusMinutes = Math.round(summary.focusSeconds / 60)

  return (
    <div className="space-y-6">
      {/* Summary header — last 7 days */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
          Last {summary.days} days
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={CalendarClock} label="Planned" value={formatMinutes(summary.plannedMinutes)} />
          <StatTile
            icon={CheckCircle2}
            label="Completed"
            value={formatMinutes(summary.completedMinutes)}
            sub={`${summary.completedCount} ${summary.completedCount === 1 ? 'task' : 'tasks'} done`}
          />
          <StatTile icon={Timer} label="Focus time" value={formatMinutes(summaryFocusMinutes)} />
          <StatTile
            icon={Gauge}
            label="Avg capacity"
            value={`${data.capacityAvgPct}%`}
            sub={
              data.planningDays > 0
                ? `${data.daysOverCapacity}/${data.planningDays} days over`
                : 'no planned days yet'
            }
          />
        </div>
      </div>

      {/* Planned vs completed effort */}
      <Panel
        icon={TrendingUp}
        title="Planned vs completed effort"
        subtitle={`Estimated effort vs how much of it is done · ${range}`}
      >
        {hasPlanned ? (
          <>
            <InsightBarChart
              points={effortPoints}
              format={formatMinutes}
              ariaLabel="Planned versus completed effort per day"
            />
            <div className="mt-3 flex items-center gap-4">
              <Swatch className={TONE.brand.track} label="Planned" />
              <Swatch className={TONE.brand.fill} label="Completed" />
            </div>
          </>
        ) : (
          <NoPlanData windowDays={data.windowDays} />
        )}
      </Panel>

      {/* Capacity / overcommitment trend */}
      <Panel
        icon={Gauge}
        title="Daily capacity"
        subtitle={
          hasPlanned
            ? `Averaged ${data.capacityAvgPct}% of capacity on planning days · over capacity on ${data.daysOverCapacity} of ${data.planningDays}`
            : 'Schedule tasks with an effort estimate to see your daily load'
        }
      >
        {hasPlanned ? (
          <>
            <InsightBarChart
              points={capacityPoints}
              max={capacityMax}
              reference={100}
              format={(v) => `${v}%`}
              ariaLabel="Daily planned capacity percentage"
            />
            <p className="mt-3 text-xs text-text-muted">
              The dashed line is 100% of your daily capacity. Bars above it are days you over-planned.
            </p>
          </>
        ) : (
          <NoPlanData windowDays={data.windowDays} />
        )}
      </Panel>

      {/* Focus trends */}
      <Panel icon={Target} title="Focus" subtitle={`Deep-work sessions · ${range}`}>
        {focus.sessionCount > 0 ? (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Sessions" value={String(focus.sessionCount)} />
              <MiniStat label="Focus time" value={formatMinutes(focusMinutes)} />
              <MiniStat label="Interruptions" value={String(focus.interruptions)} />
              <MiniStat
                label="Completion"
                value={focus.completionRate != null ? `${Math.round(focus.completionRate * 100)}%` : '—'}
                sub={`${focus.completedSessions} of ${focus.sessionCount} finished`}
              />
            </div>
            <InsightBarChart
              points={focusPoints}
              format={formatMinutes}
              heightClass="h-28"
              ariaLabel="Focus minutes per day"
            />
          </>
        ) : (
          <p className="text-sm text-text-muted">
            No focus sessions in the last {data.windowDays} days. Start one from any task to track
            deep-work time, interruptions, and completion rate here.
          </p>
        )}
      </Panel>

      {/* Roll-over patterns */}
      <Panel
        icon={RotateCcw}
        title="Roll-over & overdue"
        subtitle="How often work slips past the day you planned it"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniStat
            label="Overdue right now"
            value={`${rollover.overdueCount} ${rollover.overdueCount === 1 ? 'task' : 'tasks'}`}
            sub={
              rollover.overdueCount > 0
                ? `oldest is ${rollover.oldestOverdueDays} ${rollover.oldestOverdueDays === 1 ? 'day' : 'days'} old`
                : 'nothing overdue — nice'
            }
          />
          <MiniStat
            label="On-time completion"
            value={rollover.onTimeRatio != null ? `${Math.round(rollover.onTimeRatio * 100)}%` : '—'}
            sub={
              rollover.completedWithPlan > 0
                ? `${rollover.slippedCount} of ${rollover.completedWithPlan} slipped to a later day`
                : 'complete some scheduled tasks to measure this'
            }
          />
        </div>
      </Panel>
    </div>
  )
}
