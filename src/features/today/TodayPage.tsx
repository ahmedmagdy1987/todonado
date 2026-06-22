import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { Undo2, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui'
import { FEATURES } from '@/lib/config'
import { track } from '@/features/analytics/track'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { useTaskMutations } from '@/features/tasks/api/useTaskMutations'
import { useEffortSuggester } from '@/features/tasks/api/useEffortSuggester'
import { useCalendarBusy } from '@/features/calendar/api/useCalendarBusy'
import { withCalendar } from '@/features/calendar/capacity'
import { useUpdateCapacity } from '@/features/workspace/api/useUpdateCapacity'
import { selectToday } from '@/features/tasks/selectors'
import { QuickAdd } from '@/features/tasks/components/QuickAdd'
import { TaskListView } from '@/features/tasks/components/TaskListView'
import { todayISO, isoDateOffset } from '@/lib/date'
import { StartFromTemplateCTA } from '@/features/templates/components/StartFromTemplateCTA'
import { LoadError } from '@/components/common/LoadError'
import type { Task } from '@/types/database'
import { countUnestimated, sumEffort, suggestTasksToMoveTomorrow } from './capacity'
import { selectRolloverTasks } from './rollover'
import type { PlanPick } from './autoPlan'
import { CapacityMeter } from './CapacityMeter'
import { RolloverBanner } from './components/RolloverBanner'
import { OverbookingWarning } from './components/OverbookingWarning'
import { PlanMyDay } from './components/PlanMyDay'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function TodayPage() {
  const { user } = useAuth()
  const { workspaceId, capacityMinutes } = useWorkspace()
  const { data: tasks = [], isPending, isError, refetch } = useTasks(workspaceId)
  const { createTask, updateTask } = useTaskMutations(workspaceId)
  const suggestEffort = useEffortSuggester(workspaceId)
  const updateCapacity = useUpdateCapacity()
  // Shared undo for any "scheduled tasks to today" action (roll-over OR auto-plan);
  // `verb` keeps the banner copy accurate for each.
  const [undo, setUndo] = useState<{
    verb: string
    items: { id: string; scheduled_for: string | null }[]
  } | null>(null)

  const today = todayISO()
  const tomorrow = isoDateOffset(1)
  const name = user?.email?.split('@')[0] ?? 'there'

  // Today's calendar busy-minutes (0 when the feature/sources are off or fail).
  const { busyMinutes, hadError: calendarError } = useCalendarBusy(today)

  const todayTasks = selectToday(tasks, today)
  const overdue = selectRolloverTasks(tasks, today)
  // Capacity reflects remaining (incomplete) effort, so a finished day reads as
  // clear rather than alarmingly "overbooked".
  const movableToday = todayTasks.filter((t) => t.status === 'todo' || t.status === 'in_progress')
  const planned = sumEffort(movableToday)
  const unestimatedCount = countUnestimated(movableToday)
  // Calendar-aware: meetings consume capacity alongside task effort (computeCapacity
  // is unchanged — it's fed tasks + busy). effectiveCapacity = room left for tasks.
  const cal = withCalendar(planned, capacityMinutes, busyMinutes)
  const summary = cal.summary
  const suggestions = suggestTasksToMoveTomorrow(todayTasks, cal.effectiveCapacity)

  // capacity_viewed: once per Today mount. over_capacity_hit: once per mount, the
  // first time the day is planned over capacity (the wedge's key "aha" moment).
  useEffect(() => {
    track('capacity_viewed', { source: 'today' })
  }, [])
  const overFiredRef = useRef(false)
  useEffect(() => {
    if (summary.status === 'over' && !overFiredRef.current) {
      overFiredRef.current = true
      track('over_capacity_hit', { source: 'today' })
    }
  }, [summary.status])

  function rollOne(task: Task) {
    setUndo((prev) => ({
      verb: 'Rolled over',
      items: [...(prev?.items ?? []), { id: task.id, scheduled_for: task.scheduled_for }],
    }))
    updateTask.mutate({ id: task.id, patch: { scheduled_for: today } })
  }
  function rollAll() {
    const snapshot = overdue.map((t) => ({ id: t.id, scheduled_for: t.scheduled_for }))
    overdue.forEach((t) => updateTask.mutate({ id: t.id, patch: { scheduled_for: today } }))
    if (snapshot.length) setUndo({ verb: 'Rolled over', items: snapshot })
  }
  function undoRoll() {
    undo?.items.forEach((s) =>
      updateTask.mutate({ id: s.id, patch: { scheduled_for: s.scheduled_for } }),
    )
    setUndo(null)
  }
  function moveToTomorrow(list: Task[]) {
    list.forEach((t) => updateTask.mutate({ id: t.id, patch: { scheduled_for: tomorrow } }))
  }

  // Assumed cost for an effortless task = the 3A estimate (calc only; never written).
  const estimateCost = useCallback(
    (task: Task) => suggestEffort(task.title, task.project_id)?.minutes ?? 30,
    [suggestEffort],
  )

  function applyPlan(picks: PlanPick[]) {
    if (picks.length === 0) return
    const snapshot = picks.map((p) => ({ id: p.task.id, scheduled_for: p.task.scheduled_for }))
    picks.forEach((p) => updateTask.mutate({ id: p.task.id, patch: { scheduled_for: today } }))
    setUndo({ verb: 'Planned', items: snapshot })
    track('auto_planned', { flag: picks.some((p) => p.estimated), source: 'today' })
  }

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-text-muted">{format(new Date(), 'EEEE, MMMM d')}</p>
          <h2 className="mt-1 font-display text-3xl font-bold tracking-tight">Your Command Center</h2>
          <p className="mt-1 text-text-muted">
            {getGreeting()}, {name}. Here&rsquo;s your day at a glance.
          </p>
        </div>
        {FEATURES.autoPlan && (
          <PlanMyDay
            tasks={tasks}
            capacityMinutes={cal.effectiveCapacity}
            today={today}
            estimate={estimateCost}
            onApply={applyPlan}
            variant="compact"
          />
        )}
      </header>

      {undo && undo.items.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface-2/50 px-4 py-2.5 text-sm">
          <span className="text-text-muted">
            {undo.verb} {undo.items.length} {undo.items.length === 1 ? 'task' : 'tasks'} to today.
          </span>
          <button
            type="button"
            onClick={undoRoll}
            className="focus-ring inline-flex items-center gap-1 rounded text-accent hover:underline"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden /> Undo
          </button>
          <button
            type="button"
            onClick={() => setUndo(null)}
            aria-label="Dismiss"
            className="focus-ring ml-auto rounded p-1 text-text-muted hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      <RolloverBanner tasks={overdue} onRollOne={rollOne} onRollAll={rollAll} />

      <CapacityMeter
        summary={summary}
        unestimatedCount={unestimatedCount}
        busyMinutes={cal.busyMinutes}
        onCapacityChange={(m) => updateCapacity.mutate(m)}
      />

      {calendarError && (
        <p className="-mt-4 text-xs text-text-muted">
          Couldn&rsquo;t refresh a subscribed calendar (the provider may block browser access) —
          showing task-only capacity. Uploading the .ics file is more reliable.
        </p>
      )}

      <OverbookingWarning
        overMinutes={summary.overMinutes}
        suggestions={suggestions}
        onMoveSuggestions={moveToTomorrow}
      />

      <QuickAdd
        placeholder="Add a task to today…"
        suggest={suggestEffort}
        onAdd={(v) =>
          createTask.mutate({
            workspace_id: workspaceId,
            title: v.title,
            effort_minutes: v.effort_minutes,
            due_date: v.due_date,
            scheduled_for: today,
            position: todayTasks.length,
          })
        }
      />

      {isError ? (
        <LoadError message="We couldn't load today's tasks." onRetry={() => void refetch()} />
      ) : !isPending ? (
        <TaskListView
          workspaceId={workspaceId}
          tasks={todayTasks}
          viewKey="today"
          showSchedule={false}
          onUnschedule={(t) => updateTask.mutate({ id: t.id, patch: { scheduled_for: null } })}
          emptyState={
            <TodayEmpty
              planButton={
                FEATURES.autoPlan ? (
                  <PlanMyDay
                    tasks={tasks}
                    capacityMinutes={cal.effectiveCapacity}
                    today={today}
                    estimate={estimateCost}
                    onApply={applyPlan}
                    variant="prominent"
                  />
                ) : null
              }
            />
          }
        />
      ) : null}
    </div>
  )
}

function TodayEmpty({ planButton }: { planButton?: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <img src="/icons/icon-192.png" alt="" aria-hidden className="h-14 w-14 rounded-2xl opacity-90" />
        <div>
          <h3 className="font-display text-xl font-semibold">Your day is clear.</h3>
          <p className="mt-1 text-text-muted">Pull in what matters most.</p>
        </div>
        {planButton}
        <p className="text-xs text-text-muted/70">
          Capture tasks in the Inbox, then schedule them here.
        </p>
        <StartFromTemplateCTA />
      </CardContent>
    </Card>
  )
}
