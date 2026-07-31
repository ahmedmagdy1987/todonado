import { useMemo, useState } from 'react'
import { CalendarCheck, Wand2 } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { formatMinutes } from '@/lib/format'
import type { Task } from '@/types/database'
import { cn } from '@/lib/utils'
import { planWeek, type WeekPlanPick } from '../planWeek'
import {
  DEFAULT_PLAN_SCOPE,
  PLAN_SCOPES,
  PLAN_SCOPE_HINT,
  PLAN_SCOPE_LABEL,
  type PlanScope,
} from '@/features/today/planScope'
import { weekdayLabel } from '../week'

interface PlanMyWeekProps {
  tasks: Task[]
  capacityMinutes: number
  todayStr: string
  estimate: (task: Task) => number
  busyByDate?: Map<string, number>
  /** Schedule the picks (parent owns the mutations, batch undo + analytics). */
  onApply: (picks: WeekPlanPick[]) => void
  /** Which pool to draw from. Remembered per user by the parent. */
  scope?: PlanScope
  onScopeChange?: (scope: PlanScope) => void
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="text-center">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-text-muted">{body}</p>
      {action && (
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

/** Two choices, stated plainly. Mirrors the day planner exactly. */
function ScopePicker({ scope, onChange }: { scope: PlanScope; onChange: (next: PlanScope) => void }) {
  return (
    <fieldset>
      <legend className="text-xs font-medium text-text-muted">Pull from</legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {PLAN_SCOPES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={scope === option}
            title={PLAN_SCOPE_HINT[option]}
            onClick={() => onChange(option)}
            className={cn(
              'focus-ring inline-flex min-h-[44px] items-center rounded-xl border px-3 text-sm font-medium transition-colors md-fine:min-h-0 md-fine:py-1.5',
              scope === option
                ? 'border-transparent bg-brand-gradient text-white'
                : 'border-white/10 text-text-muted hover:text-text-primary',
            )}
          >
            {PLAN_SCOPE_LABEL[option]}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * "Plan my week" — the same preview/confirm contract as PlanMyDay, across seven
 * days. Nothing is written until the user accepts, and the planner cannot
 * overcommit a single day or schedule anything past its own deadline.
 */
export function PlanMyWeek({
  tasks,
  capacityMinutes,
  todayStr,
  estimate,
  busyByDate,
  onApply,
  scope = DEFAULT_PLAN_SCOPE,
  onScopeChange,
}: PlanMyWeekProps) {
  const [open, setOpen] = useState(false)
  const plan = useMemo(
    () => planWeek({ tasks, capacityMinutes, todayStr, estimate, busyByDate, scope }),
    [tasks, capacityMinutes, todayStr, estimate, busyByDate, scope],
  )

  const hasPlan = plan.taskCount > 0
  const filledDays = plan.days.filter((d) => d.picks.length > 0)

  function confirm() {
    onApply(plan.picks)
    setOpen(false)
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Wand2 className="h-4 w-4" aria-hidden /> Plan my week
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Plan my week">
        <div className="space-y-4 p-5">
          {onScopeChange && <ScopePicker scope={scope} onChange={onScopeChange} />}

          {plan.weekFull ? (
            <EmptyState
              title="Your week is already full"
              body="Every day is at capacity. Finish or move something to make room."
            />
          ) : plan.candidateCount === 0 && plan.excludedByScope > 0 ? (
            <EmptyState
              title="Nothing dated left to plan"
              body={`Everything with a deadline is already placed. You have ${plan.excludedByScope} unscheduled ${
                plan.excludedByScope === 1 ? 'task' : 'tasks'
              } without one.`}
              action={
                onScopeChange ? { label: 'Include them', onClick: () => onScopeChange('all') } : undefined
              }
            />
          ) : plan.candidateCount === 0 && plan.alreadyPlanned > 0 ? (
            <EmptyState
              title="It is all planned already"
              body={`Your ${plan.alreadyPlanned} open ${
                plan.alreadyPlanned === 1 ? 'task is' : 'tasks are'
              } already on a day. Nothing is waiting to be scheduled.`}
            />
          ) : plan.candidateCount === 0 ? (
            <EmptyState
              title="Nothing to plan yet"
              body="Capture a few tasks in your Inbox and they will be planned into the week."
            />
          ) : !hasPlan ? (
            <EmptyState
              title="Nothing fits this week"
              body="What's left is either bigger than any day's remaining room, or due before a day with space."
            />
          ) : (
            <>
              <p className="text-sm text-text-muted">
                Plan{' '}
                <strong className="text-text-primary">
                  {plan.taskCount} {plan.taskCount === 1 ? 'task' : 'tasks'}
                </strong>{' '}
                (~{formatMinutes(plan.totalMinutes)}) across {filledDays.length}{' '}
                {filledDays.length === 1 ? 'day' : 'days'}. No day goes over capacity, and nothing
                lands after its due date.
              </p>

              <ul className="max-h-72 space-y-3 overflow-y-auto pr-1">
                {filledDays.map((day) => (
                  <li key={day.date}>
                    <div className="mb-1 flex items-baseline gap-2">
                      <h4 className="font-display text-sm font-semibold">
                        {day.date === todayStr ? 'Today' : weekdayLabel(day.date)}
                      </h4>
                      <span className="font-mono text-xs text-text-muted">
                        {day.picks.length} {day.picks.length === 1 ? 'task' : 'tasks'} · ~
                        {formatMinutes(day.addedMinutes)}
                      </span>
                      <span className="ml-auto font-mono text-[11px] text-text-muted">
                        of {formatMinutes(day.remainingBefore)} free
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {day.picks.map((pick) => (
                        <li
                          key={pick.task.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-surface-2/40 px-3 py-1.5 text-sm"
                        >
                          <span className="min-w-0 truncate text-text-primary">
                            {pick.task.title}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-text-muted">
                            {pick.estimated ? `~${formatMinutes(pick.cost)} est` : formatMinutes(pick.cost)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              {plan.skipped > 0 && (
                <p className="text-xs text-text-muted">
                  {plan.skipped} more didn&rsquo;t fit this week — they stay in your backlog.
                </p>
              )}
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {hasPlan ? 'Cancel' : 'Close'}
            </Button>
            {hasPlan && (
              <Button type="button" onClick={confirm}>
                <CalendarCheck className="h-4 w-4" aria-hidden />
                Plan {plan.taskCount} into the week
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
