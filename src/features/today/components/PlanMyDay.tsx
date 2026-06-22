import { useMemo, useState } from 'react'
import { Wand2 } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { formatMinutes } from '@/lib/format'
import type { Task } from '@/types/database'
import { planDay, type PlanPick } from '../autoPlan'

interface PlanMyDayProps {
  tasks: Task[]
  capacityMinutes: number
  today: string
  /** Assumed cost for a task with no effort_minutes (calc only — never written). */
  estimate: (task: Task) => number
  /** Schedule the picks to today (parent owns the mutation + undo + analytics). */
  onApply: (picks: PlanPick[]) => void
  variant?: 'prominent' | 'compact'
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-text-muted">{body}</p>
    </div>
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
}: PlanMyDayProps) {
  const [open, setOpen] = useState(false)
  const plan = useMemo(
    () => planDay(tasks, capacityMinutes, today, estimate),
    [tasks, capacityMinutes, today, estimate],
  )

  const hasPlan = !plan.capacityFull && plan.picks.length > 0

  function confirm() {
    onApply(plan.picks)
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        variant={variant === 'prominent' ? 'primary' : 'secondary'}
        size={variant === 'prominent' ? 'lg' : 'sm'}
      >
        <Wand2 className="h-4 w-4" aria-hidden /> Plan my day
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Plan my day">
        <div className="space-y-4 p-5">
          {plan.capacityFull ? (
            <EmptyState
              title="Your day's already planned"
              body="You're at capacity for today — finish or move something to make room."
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
