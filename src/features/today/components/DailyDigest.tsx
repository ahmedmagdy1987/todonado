import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Flame,
  RotateCcw,
  Sparkles,
  Sunrise,
  X,
} from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { FEATURES } from '@/lib/config'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Digest } from '../digest'

interface DailyDigestProps {
  digest: Digest
  greeting: string
  name: string
  todayStr: string
  /** PRO: accept the pre-computed plan (parent owns the mutation, undo + analytics). */
  onAccept: () => void
  onDismiss: () => void
  /** The existing PlanMyDay control — "Plan my day" on Free, "Adjust" on Pro. */
  planAction: ReactNode
}

function Stat({ icon: Icon, children }: { icon: typeof Flame; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm text-text-muted">
      <Icon className="h-4 w-4 shrink-0 text-text-muted/70" aria-hidden />
      <span className="min-w-0">{children}</span>
    </li>
  )
}

/**
 * The "Start your day" briefing.
 *
 * Composed entirely from data Today has already fetched — it renders on the
 * first paint alongside the meter and never awaits anything, so it cannot delay
 * or block the page. Sections appear only when they have something to say
 * (see composeDigest); nothing here invents a number.
 */
export function DailyDigest({
  digest,
  greeting,
  name,
  todayStr,
  onAccept,
  onDismiss,
  planAction,
}: DailyDigestProps) {
  const {
    variant,
    streakCount,
    streakIncludesToday,
    rollover,
    meetings,
    freeMinutes,
    capacityStatus,
    suggestion,
    bias,
    alerts,
    proTeaser,
    dayAlreadyPlanned,
    unplanned,
  } = digest

  const dateLabel = (() => {
    try {
      return format(parseISO(todayStr), 'EEEE, MMMM d')
    } catch {
      return todayStr
    }
  })()

  return (
    <section
      aria-labelledby="daily-digest-heading"
      className="relative overflow-hidden rounded-2xl border border-brand/20 bg-surface shadow-elevation"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24"
        style={{
          background:
            'radial-gradient(60% 100% at 20% 0%, rgba(108,92,231,0.16) 0%, transparent 70%)',
        }}
      />

      <div className="relative space-y-4 p-5">
        <header className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
            <Sunrise className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="daily-digest-heading" className="font-display text-base font-semibold">
              {greeting}, {name}
            </h3>
            <p className="text-xs text-text-muted">{dateLabel}</p>
          </div>
          {streakCount >= 1 && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
              title={
                streakIncludesToday
                  ? 'You planned today — nice.'
                  : 'Plan something today to keep your streak going.'
              }
            >
              <Flame className="h-3 w-3" aria-hidden />
              {streakCount}
            </span>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss today’s briefing"
            className="tap-44 focus-ring -mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-primary"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        {variant === 'welcome' && (
          <p className="text-sm text-text-muted">
            Welcome aboard. Each morning this card sums up what carried over, what your calendar
            already claims, and how much of the day is genuinely free.
          </p>
        )}

        {(rollover || meetings) && (
          <ul className="space-y-1.5">
            {rollover && (
              <Stat icon={RotateCcw}>
                Carried over from {rollover.span === 'earlier' ? 'earlier days' : 'yesterday'}:{' '}
                <strong className="font-medium text-text-primary">
                  {rollover.count} {rollover.count === 1 ? 'task' : 'tasks'}
                </strong>
                {rollover.minutes > 0 && <> (~{formatMinutes(rollover.minutes)})</>}
              </Stat>
            )}
            {meetings && (
              <Stat icon={CalendarClock}>
                Today’s meetings:{' '}
                <strong className="font-medium text-text-primary">
                  ~{formatMinutes(meetings.minutes)}
                </strong>
              </Stat>
            )}
          </ul>
        )}

        <p
          className={cn(
            'font-display text-lg font-semibold',
            capacityStatus === 'over' ? 'text-danger' : 'text-text-primary',
          )}
        >
          {capacityStatus === 'over'
            ? 'Today is already over capacity.'
            : freeMinutes > 0
              ? `You have about ${formatMinutes(freeMinutes)} free today.`
              : 'Your day is full.'}
        </p>

        {/* PRO — priority alerts */}
        {alerts.length > 0 && (
          <ul className="space-y-1.5 rounded-xl border border-warning/20 bg-warning/5 p-3">
            {alerts.map(({ task, kind }) => (
              <li key={task.id} className="flex items-start gap-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                <span className="min-w-0 text-text-muted">
                  <span className="text-text-primary">{task.title}</span>
                  {kind === 'overdue' ? ' — high priority, overdue' : ' — due within 48 hours'}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* PRO — the ready-made plan */}
        {suggestion && (
          <div className="rounded-xl border border-brand/25 bg-brand-gradient-soft p-3.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden />
              <p className="text-sm font-medium text-text-primary">
                Your suggested day: {suggestion.taskCount}{' '}
                {suggestion.taskCount === 1 ? 'task' : 'tasks'}, ~
                {formatMinutes(suggestion.totalMinutes)}
              </p>
            </div>
            <ul className="mt-2.5 space-y-1">
              {suggestion.picks.slice(0, 3).map((p) => (
                <li key={p.task.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-text-primary/90">{p.task.title}</span>
                  <span className="shrink-0 font-mono text-text-muted">
                    {p.estimated ? `~${formatMinutes(p.cost)}` : formatMinutes(p.cost)}
                  </span>
                </li>
              ))}
              {suggestion.picks.length > 3 && (
                <li className="text-xs text-text-muted">
                  +{suggestion.picks.length - 3} more
                </li>
              )}
            </ul>
            {bias && (
              <p className="mt-2.5 text-xs leading-relaxed text-text-muted">
                You tend to {bias.direction === 'under' ? 'underestimate' : 'overestimate'} by ~
                {bias.pct}% — today’s plan{' '}
                {bias.direction === 'under' ? 'leaves breathing room' : 'can afford a little more'}.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={onAccept}>
                <Check className="h-4 w-4" aria-hidden /> Accept
              </Button>
              {planAction}
            </div>
          </div>
        )}

        {/* FREE — one quiet line, then the real action. No fake urgency. */}
        {proTeaser && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-white/5 bg-surface-2/40 px-3 py-2 text-xs text-text-muted">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
            <span>Your suggested day is ready — with Pro it’s one tap.</span>
            <Link
              to="/settings/plan"
              className="focus-ring rounded text-accent underline-offset-4 hover:underline"
            >
              See Pro
            </Link>
          </div>
        )}

        {dayAlreadyPlanned && (
          <p className="text-xs text-text-muted">
            Today is already planned to capacity — finish or move something to make room.
          </p>
        )}

        {/* Never let a quiet card read as "you have nothing". If work is waiting,
            say how much of it before offering the button. */}
        {!suggestion && !dayAlreadyPlanned && unplanned > 0 && (
          <p className="text-xs text-text-muted">
            {unplanned} {unplanned === 1 ? 'task is' : 'tasks are'} waiting to be scheduled.
          </p>
        )}

        {!suggestion && !dayAlreadyPlanned && (
          <div className="flex items-center gap-2">
            {planAction}
            {!proTeaser && (
              <Badge variant="outline" className="hidden sm:inline-flex">
                one tap
              </Badge>
            )}
          </div>
        )}

        {/* The other end of the day. This card is the one thing a user reliably
            reads before starting, so it is also where they'll look when they
            stop — a quiet link, never a prompt, and never a nag about a day
            that isn't over. */}
        {FEATURES.journal && (
          <p className="text-xs text-text-muted">
            Finishing up?{' '}
            <Link
              to="/journal"
              className="tap-44 focus-ring inline-block rounded py-1 text-accent underline-offset-4 hover:underline"
            >
              Write down how today went
            </Link>
            .
          </p>
        )}
      </div>
    </section>
  )
}
