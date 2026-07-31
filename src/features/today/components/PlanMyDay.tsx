import { useEffect, useMemo, useRef, useState } from 'react'
import { Wand2 } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Task } from '@/types/database'
import { planDay, type PlanPick } from '../autoPlan'
import {
  DEFAULT_PLAN_SCOPE,
  PLAN_SCOPES,
  PLAN_SCOPE_HINT,
  PLAN_SCOPE_LABEL,
  type PlanScope,
} from '../planScope'

interface PlanMyDayProps {
  tasks: Task[]
  capacityMinutes: number
  today: string
  /** Assumed cost for a task with no effort_minutes (calc only — never written). */
  estimate: (task: Task) => number
  /** Schedule the picks to today (parent owns the mutation + undo + analytics). */
  onApply: (picks: PlanPick[]) => void
  variant?: 'prominent' | 'compact'
  /** Trigger label. The digest reuses this control as "Adjust". */
  label?: string
  /** Open the preview immediately — the Hub's "Build my day" tile deep-links here. */
  defaultOpen?: boolean
  /**
   * False while the calendar is still being consulted.
   *
   * The button promises the plan will never go over capacity, and it can only
   * keep that promise once it knows how much of the day the calendar has
   * already taken. Confirming inside that window planned — and wrote — a day
   * the app believed was empty.
   */
  ready?: boolean
  /** Which pool to draw from. Remembered per user by the parent. */
  scope?: PlanScope
  onScopeChange?: (scope: PlanScope) => void
}

/**
 * An empty result always carries the reason and, where one exists, the fix.
 *
 * "Nothing to plan" was the single most misleading string in the product: it
 * was shown to people with a hundred open tasks, because the planner could not
 * see project work without a deadline. The rule is fixed, but the lesson is
 * that an empty state has to say WHICH kind of empty it is, and never be a dead
 * end when a one-tap answer exists.
 */
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

/** Two choices, stated plainly. Not a settings screen. */
function ScopePicker({
  scope,
  onChange,
}: {
  scope: PlanScope
  onChange: (next: PlanScope) => void
}) {
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
 * "Plan my day" — opens a preview/confirm built from the deterministic planner,
 * then (on confirm) hands the picks to the parent to schedule. Never commits
 * without the user accepting; the planner never exceeds remaining capacity.
 */
export function PlanMyDay({
  tasks,
  capacityMinutes,
  today,
  estimate,
  onApply,
  variant = 'compact',
  label = 'Plan my day',
  defaultOpen = false,
  ready = true,
  scope = DEFAULT_PLAN_SCOPE,
  onScopeChange,
}: PlanMyDayProps) {
  const [open, setOpen] = useState(false)
  /**
   * The deep link (`/today?plan=1`) opens the preview — but only ONCE the
   * calendar has been consulted, because the whole point of the gate is that a
   * plan built before then is built on a day the app wrongly believes is empty.
   *
   * This has to be an effect, not initial state: `ready` is false on the first
   * render by definition, so `useState(defaultOpen && ready)` never opened at
   * all. `autoOpened` makes it fire exactly once, so closing it stays closed.
   */
  const autoOpened = useRef(false)
  useEffect(() => {
    if (!defaultOpen || !ready || autoOpened.current) return
    autoOpened.current = true
    setOpen(true)
  }, [defaultOpen, ready])
  const plan = useMemo(
    () => planDay(tasks, capacityMinutes, today, estimate, scope),
    [tasks, capacityMinutes, today, estimate, scope],
  )

  const hasPlan = !plan.capacityFull && plan.picks.length > 0
  const widen = onScopeChange ? () => onScopeChange('all') : undefined

  function confirm() {
    // Belt and braces: the trigger is disabled while `ready` is false, but the
    // preview can also be opened by a deep link, and a confirm must never apply
    // a plan built without the calendar.
    if (!ready) return
    onApply(plan.picks)
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!ready}
        title={ready ? undefined : 'Checking your calendar…'}
        variant={variant === 'prominent' ? 'primary' : 'secondary'}
        size={variant === 'prominent' ? 'lg' : 'sm'}
      >
        <Wand2 className="h-4 w-4" aria-hidden /> {label}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Plan my day">
        <div className="space-y-4 p-5">
          {onScopeChange && <ScopePicker scope={scope} onChange={onScopeChange} />}

          {plan.capacityFull ? (
            <EmptyState
              title="Your day is already full"
              body="You are at capacity for today. Finish or move something to make room."
            />
          ) : plan.candidateCount === 0 && plan.excludedByScope > 0 ? (
            <EmptyState
              title="Nothing dated left to plan"
              body={`Everything with a date is already planned. You have ${plan.excludedByScope} unscheduled ${
                plan.excludedByScope === 1 ? 'task' : 'tasks'
              } without one.`}
              action={widen ? { label: 'Include them', onClick: widen } : undefined}
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
              body="Capture a few tasks in your Inbox, then plan them into your day."
            />
          ) : plan.picks.length === 0 ? (
            <EmptyState
              title="Nothing fits right now"
              body={`You have about ${formatMinutes(plan.remainingCapacity)} left, but your smallest eligible task is bigger than that.`}
            />
          ) : (
            <>
              <p className="text-sm text-text-muted">
                Plan{' '}
                <strong className="text-text-primary">
                  {plan.picks.length} {plan.picks.length === 1 ? 'task' : 'tasks'}
                </strong>{' '}
                (~{formatMinutes(plan.totalMinutes)}) into today? This fills toward your remaining{' '}
                {formatMinutes(plan.remainingCapacity)} — never over.
              </p>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {plan.picks.map((p) => (
                  <li
                    key={p.task.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-surface-2/40 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-text-primary">{p.task.title}</span>
                    <span className="shrink-0 font-mono text-xs text-text-muted">
                      {p.estimated ? `~${formatMinutes(p.cost)} est` : formatMinutes(p.cost)}
                    </span>
                  </li>
                ))}
              </ul>
              {plan.skipped > 0 && (
                <p className="text-xs text-text-muted">
                  {plan.skipped} more didn&rsquo;t fit — they stay in your backlog.
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
                Plan {plan.picks.length} into today
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
