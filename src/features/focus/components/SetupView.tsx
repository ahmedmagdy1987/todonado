import { useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { Button, Card, CardContent, Input, Select } from '@/components/ui'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { cn } from '@/lib/utils'
import { useFocusMutations } from '../api/useFocusSessions'

const PRESETS = [25, 50, 90]
const DEFAULT_MINUTES = 50

export function SetupView({
  initialTaskId,
  onStarted,
}: {
  initialTaskId: string | null
  onStarted: () => void
}) {
  const { workspaceId } = useWorkspace()
  const { data: tasks = [] } = useTasks(workspaceId)
  const { startSession } = useFocusMutations(workspaceId)
  const [taskId, setTaskId] = useState(initialTaskId ?? '')
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES)

  const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')

  // Picking a task pre-fills the planned duration from its effort estimate.
  useEffect(() => {
    if (!taskId) return
    const task = tasks.find((t) => t.id === taskId)
    if (task?.effort_minutes && task.effort_minutes > 0) {
      setMinutes(task.effort_minutes)
    }
  }, [taskId, tasks])

  function start() {
    startSession.mutate({
      workspace_id: workspaceId,
      task_id: taskId || null,
      planned_minutes: Math.max(1, Math.round(minutes)),
    })
    onStarted()
  }

  return (
    <div className="animate-fade-in space-y-8">
      <header>
        <h2 className="font-display text-2xl font-bold tracking-tight">Focus</h2>
        <p className="mt-1 text-text-muted">Lock in. One task at a time.</p>
      </header>

      <Card>
        <CardContent className="space-y-6">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-text-muted">Task</span>
            <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">General focus</option>
              {openTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </label>

          <div className="space-y-2">
            <span className="text-xs font-medium text-text-muted">Duration</span>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setMinutes(p)}
                  className={cn(
                    'focus-ring rounded-xl border px-4 py-2 text-sm font-medium transition-colors',
                    minutes === p
                      ? 'border-transparent bg-brand-gradient text-white'
                      : 'border-white/10 text-text-muted hover:text-text-primary',
                  )}
                >
                  {p} min
                </button>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value) || DEFAULT_MINUTES)}
                  className="h-10 w-24"
                  aria-label="Custom duration in minutes"
                />
                <span className="text-sm text-text-muted">min</span>
              </div>
            </div>
          </div>

          <Button onClick={start} size="lg" className="w-full">
            <Target className="h-4 w-4" aria-hidden />
            Start {Math.max(1, Math.round(minutes))}-min sprint
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
