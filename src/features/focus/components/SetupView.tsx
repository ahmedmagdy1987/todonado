import { useEffect, useRef, useState } from 'react'
import { Target, Timer } from 'lucide-react'
import { Button, Card, CardContent, Input, Select } from '@/components/ui'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { FEATURES } from '@/lib/config'
import { cn } from '@/lib/utils'
import type { FocusSession } from '@/types/database'
import { useFocusMutations } from '../api/useFocusSessions'
import { POMODORO } from '../pomodoro'
import { isOptimisticId } from '@/lib/optimistic'

const PRESETS = [25, 50, 90]
const DEFAULT_MINUTES = 50

export function SetupView({
  initialTaskId,
  initialPomodoro = false,
  onStarted,
}: {
  initialTaskId: string | null
  /** Start in pomodoro mode — the Get-to-Work hand-off uses `?pomodoro=1`. */
  initialPomodoro?: boolean
  onStarted: (session: FocusSession, pomodoro: boolean) => void
}) {
  const { workspaceId } = useWorkspace()
  const { data: tasks = [] } = useTasks(workspaceId)
  const { startSession } = useFocusMutations(workspaceId)
  // A task id arrives here from the URL (`/focus?task=…`), which survives the
  // cache reconcile that repairs everything else — so a placeholder parked in
  // the address bar stayed poisonous for as long as the page was open. Drop it
  // and fall back to "General focus" rather than carrying it into
  // `focus_sessions.task_id`.
  const [taskId, setTaskId] = useState(
    initialTaskId && !isOptimisticId(initialTaskId) ? initialTaskId : '',
  )
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES)
  const [pomodoro, setPomodoro] = useState(FEATURES.pomodoro && initialPomodoro)
  const prefilledFor = useRef<string | null>(null)

  const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')

  // Pre-fill the planned duration from a task's effort — ONCE per task selection,
  // so a background tasks refetch (realtime / window focus) can't clobber a
  // duration the user picked after selecting the task.
  useEffect(() => {
    if (!taskId || prefilledFor.current === taskId) return
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return // tasks not loaded yet — retry when they arrive
    prefilledFor.current = taskId
    if (task.effort_minutes && task.effort_minutes > 0) {
      setMinutes(task.effort_minutes)
    }
  }, [taskId, tasks])

  // In pomodoro mode the interval length IS the cadence — an adjustable
  // "pomodoro" is just a sprint with extra words.
  const plannedMinutes = pomodoro ? POMODORO.workMinutes : Math.max(1, Math.round(minutes))

  function start() {
    startSession.mutate(
      {
        workspace_id: workspaceId,
        task_id: taskId || null,
        planned_minutes: plannedMinutes,
      },
      // The chain needs the REAL row id, so it is opened from the insert's result
      // rather than optimistically. A failed insert therefore starts no chain.
      { onSuccess: (session) => onStarted(session, pomodoro) },
    )
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

          {FEATURES.pomodoro && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-text-muted">Rhythm</legend>
              <div className="flex flex-wrap gap-2">
                <ModeButton active={!pomodoro} onClick={() => setPomodoro(false)}>
                  One sprint
                </ModeButton>
                <ModeButton active={pomodoro} onClick={() => setPomodoro(true)}>
                  <Timer className="h-3.5 w-3.5" aria-hidden />
                  Pomodoro
                </ModeButton>
              </div>
              {pomodoro && (
                <p className="text-xs leading-relaxed text-text-muted">
                  {POMODORO.workMinutes} minutes of work, then a {POMODORO.breakMinutes}-minute
                  break, and a {POMODORO.longBreakMinutes}-minute one after every{' '}
                  {POMODORO.cyclesBeforeLongBreak}. Each interval is recorded as its own focus
                  session, so breaks never count as focus time.
                </p>
              )}
            </fieldset>
          )}

          {!pomodoro && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-text-muted">Duration</span>
              <div className="flex flex-wrap items-center gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setMinutes(p)}
                    className={cn(
                      'focus-ring min-h-[44px] rounded-xl border px-4 py-2 text-sm font-medium transition-colors md-fine:min-h-0',
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
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      // Allow clear-and-retype (no snap to default) and never show a
                      // negative; start() clamps to a minimum of 1.
                      setMinutes(e.target.value === '' || !Number.isFinite(n) ? 0 : Math.max(0, Math.floor(n)))
                    }}
                    className="h-10 w-24"
                    aria-label="Custom duration in minutes"
                  />
                  <span className="text-sm text-text-muted">min</span>
                </div>
              </div>
            </div>
          )}

          {/*
            `loading` as well as `disabled`, because the insert is awaited before
            the running view appears (see useFocusSessions) and a greyed-out
            button with no spinner reads as a dead button rather than as work in
            progress. `disabled` is kept explicitly: it is what makes a second
            click impossible, and that must not depend on how `loading` happens
            to be implemented in the Button primitive.
          */}
          <Button
            onClick={start}
            size="lg"
            className="w-full"
            loading={startSession.isPending}
            disabled={startSession.isPending}
          >
            <Target className="h-4 w-4" aria-hidden />
            {pomodoro ? `Start pomodoro 1 of ${POMODORO.cyclesBeforeLongBreak}` : `Start ${plannedMinutes}-min sprint`}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition-colors md-fine:min-h-0',
        active
          ? 'border-transparent bg-brand-gradient text-white'
          : 'border-white/10 text-text-muted hover:text-text-primary',
      )}
    >
      {children}
    </button>
  )
}
