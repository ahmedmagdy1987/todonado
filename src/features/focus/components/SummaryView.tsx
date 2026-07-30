import { Check, RotateCcw } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { useTaskMutations } from '@/features/tasks/api/useTaskMutations'
import { nextOccurrenceDate } from '@/features/tasks/recurrence'
import { useToast } from '@/components/common/toast-context'
import { FEATURES } from '@/lib/config'
import { todayISO } from '@/lib/date'
import { formatDateShort } from '@/lib/format'
import type { FocusSession } from '@/types/database'
import { useFocusSessions } from '../api/useFocusSessions'
import { pomodorosCompletedOn } from '../pomodoro'
import { formatClock } from '../timer'

export function SummaryView({
  session,
  onDone,
}: {
  session: FocusSession
  onDone: () => void
}) {
  const { workspaceId } = useWorkspace()
  const toast = useToast()
  const { data: tasks = [] } = useTasks(workspaceId)
  const { toggleComplete } = useTaskMutations(workspaceId)
  const task = session.task_id ? (tasks.find((t) => t.id === session.task_id) ?? null) : null

  // Pomodoros today, read straight off the session rows this page already has in
  // cache (zero extra requests). Counting the ROWS rather than a stored tally is
  // why the number survives a cleared localStorage, another device and a reload.
  const { data: sessions = [] } = useFocusSessions(workspaceId)
  const pomodorosToday = FEATURES.pomodoro ? pomodorosCompletedOn(sessions, todayISO()) : 0

  return (
    <div className="animate-fade-in space-y-8">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
            <Check className="h-7 w-7" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold">Done. Momentum &gt; perfection.</h2>
            <p className="mt-1 text-text-muted">
              {task ? (
                <>
                  Focused on <span className="text-text-primary">{task.title}</span>
                </>
              ) : (
                'General focus session'
              )}
            </p>
          </div>

          <div className="flex gap-10">
            <div>
              <p className="font-mono text-2xl font-semibold text-text-primary">
                {formatClock(session.actual_seconds)}
              </p>
              <p className="text-xs text-text-muted">focused</p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold text-text-primary">
                {session.interruptions}
              </p>
              <p className="text-xs text-text-muted">interruptions</p>
            </div>
            {pomodorosToday > 0 && (
              <div>
                <p className="font-mono text-2xl font-semibold text-text-primary">
                  {pomodorosToday}
                </p>
                <p className="text-xs text-text-muted">
                  {pomodorosToday === 1 ? 'pomodoro today' : 'pomodoros today'}
                </p>
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {task && task.status !== 'done' && (
              <Button
                onClick={() => {
                  toggleComplete.mutate(
                    { task, done: true },
                    {
                      onSuccess: (result) => {
                        if (!task.recurrence_freq) return
                        const next = nextOccurrenceDate(task)
                        if (result.spawnedNext && next) {
                          toast.show(`↻ Next occurrence scheduled for ${formatDateShort(next)}`)
                        } else if (!result.spawnedNext && next === null) {
                          toast.show('↻ Recurrence finished: no more occurrences')
                        }
                      },
                    },
                  )
                  onDone()
                }}
              >
                <Check className="h-4 w-4" aria-hidden /> Mark task complete
              </Button>
            )}
            <Button variant="secondary" onClick={onDone}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Start another sprint
            </Button>
          </div>

          {session.status === 'abandoned' && (
            <p className="text-xs text-text-muted/70">
              Short session, not counted toward focus time.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
