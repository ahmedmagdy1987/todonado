import { Check, RotateCcw } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { useTaskMutations } from '@/features/tasks/api/useTaskMutations'
import type { FocusSession } from '@/types/database'
import { formatClock } from '../timer'

export function SummaryView({
  session,
  onDone,
}: {
  session: FocusSession
  onDone: () => void
}) {
  const { workspaceId } = useWorkspace()
  const { data: tasks = [] } = useTasks(workspaceId)
  const { toggleComplete } = useTaskMutations(workspaceId)
  const task = session.task_id ? (tasks.find((t) => t.id === session.task_id) ?? null) : null

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
          </div>

          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {task && task.status !== 'done' && (
              <Button
                onClick={() => {
                  toggleComplete.mutate({ id: task.id, done: true })
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
              Short session — not counted toward focus time.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
