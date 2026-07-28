import { useMemo, useState } from 'react'
import { CalendarCheck, Wand2 } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { formatMinutes } from '@/lib/format'
import type { Task } from '@/types/database'
import { planWeek, type WeekPlanPick } from '../planWeek'
import { weekdayLabel } from '../week'

interface PlanMyWeekProps {
  tasks: Task[]
  capacityMinutes: number
  todayStr: string
  estimate: (task: Task) => number
  busyByDate?: Map<string, number>
  /** Schedule the picks (parent owns the mutations, batch undo + analytics). */
  onApply: (picks: WeekPlanPick[]) => void
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
}: PlanMyWeekProps) {
  const [open, setOpen] = useState(false)
  const plan = useMemo(
    () => planWeek({ tasks, capacityMinutes, todayStr, estimate, busyByDate }),
    [tasks, capacityMinutes, todayStr, estimate, busyByDate],
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
          {plan.weekFull ? (
            <EmptyState
              title="Your week is already full"
              body="Every day is at capacity — finish or move something to make room."
            />
          ) : plan.candidateCount === 0 ? (
            <EmptyState
              title="Nothing to plan yet"
              body="Capture a few tasks in your Inbox, or give a project task a deadline, and they'll be planned into the week."
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
