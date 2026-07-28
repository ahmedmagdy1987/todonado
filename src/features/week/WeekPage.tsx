import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CalendarRange, Sun, Undo2, X } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { FullScreenLoader } from '@/components/common/FullScreenLoader'
import { LoadError } from '@/components/common/LoadError'
import { formatMinutes } from '@/lib/format'
import { todayISO } from '@/lib/date'
import { track } from '@/features/analytics/track'
import { usePlan } from '@/features/billing/usePlan'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { useTaskMutations } from '@/features/tasks/api/useTaskMutations'
import { useEffortSuggester } from '@/features/tasks/api/useEffortSuggester'
import { TaskDialog } from '@/features/tasks/components/TaskDialog'
import { useCalendarBusyByDate } from '@/features/calendar/api/useCalendarBusyByDate'
import type { Task } from '@/types/database'
import { buildWeek, dateFromDroppableId, dayAnchorId, weekDates, weekPlannedMinutes } from './week'
import { DayColumn } from './components/DayColumn'
import { WeekTaskItem } from './components/WeekTaskItem'
import { WeekTaskCard } from './components/WeekTaskCard'
import { WeekQuickAdd } from './components/WeekQuickAdd'
import { PlanMyWeek } from './components/PlanMyWeek'
import type { WeekPlanPick } from './planWeek'
import { WeekStrip } from './components/WeekStrip'
import { WeekUpsell } from './components/WeekUpsell'

/** Snapshot of where tasks were before a move, for one-tap undo. */
interface WeekUndo {
  verb: string
  items: { id: string; scheduled_for: string | null }[]
}

export function WeekPage() {
  const { isPro, billingLoading } = usePlan()
  const { workspaceId, capacityMinutes } = useWorkspace()
  const { data: tasks = [], isPending, isError, refetch } = useTasks(workspaceId)
  // Delete lives in the shared TaskDialog, so the board doesn't need it here.
  const { createTask, updateTask, toggleComplete } = useTaskMutations(workspaceId)
  const suggestEffort = useEffortSuggester(workspaceId)
  const [undo, setUndo] = useState<WeekUndo | null>(null)
  const [editing, setEditing] = useState<Task | null>(null)

  const today = todayISO()
  const dates = useMemo(() => weekDates(today), [today])
  const { byDate } = useCalendarBusyByDate(dates)

  const days = useMemo(
    () => buildWeek({ todayStr: today, tasks, capacityMinutes, busyByDate: byDate }),
    [today, tasks, capacityMinutes, byDate],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const date = dateFromDroppableId(String(over.id))
    if (!date) return
    const task = tasks.find((t) => t.id === String(active.id))
    // Moving a task changes ONLY its day. Effort, priority, project and notes are
    // never touched — a drag must never silently rewrite what the task is.
    if (!task || task.scheduled_for === date) return
    setUndo({ verb: 'Moved', items: [{ id: task.id, scheduled_for: task.scheduled_for }] })
    updateTask.mutate({ id: task.id, patch: { scheduled_for: date } })
  }

  function undoMove() {
    undo?.items.forEach((s) =>
      updateTask.mutate({ id: s.id, patch: { scheduled_for: s.scheduled_for } }),
    )
    setUndo(null)
  }

  /**
   * Apply a whole week plan. The undo snapshot records EVERY task's previous
   * date before anything changes, so one tap restores the week exactly — the
   * same shape as a single move, just with more items.
   */
  function applyWeekPlan(picks: WeekPlanPick[]) {
    if (picks.length === 0) return
    setUndo({
      verb: 'Planned',
      items: picks.map((p) => ({ id: p.task.id, scheduled_for: p.task.scheduled_for })),
    })
    picks.forEach((p) => updateTask.mutate({ id: p.task.id, patch: { scheduled_for: p.date } }))
    // Reuses the existing event; `source` is free text, so no migration.
    track('auto_planned', { flag: picks.some((p) => p.estimated), source: 'week' })
  }

  /** Assumed cost for an effortless task — calc only, never written. */
  const estimateCost = (task: Task) => suggestEffort(task.title, task.project_id)?.minutes ?? 30

  // Free users get the honest sample-data preview, never their own week teased.
  if (!isPro && !billingLoading) return <WeekUpsell />
  if (billingLoading || isPending) return <FullScreenLoader label="Loading your week…" />
  if (isError) {
    return (
      <div className="animate-fade-in">
        <LoadError message="We couldn't load your week." onRetry={() => void refetch()} />
      </div>
    )
  }

  const plannedTotal = weekPlannedMinutes(days)

  function taskRow(task: Task) {
    return (
      <WeekTaskItem key={task.id} id={task.id} label={task.title}>
        <WeekTaskCard
          task={task}
          onToggle={(t) => toggleComplete.mutate({ task: t, done: t.status !== 'done' })}
          onOpen={setEditing}
        />
      </WeekTaskItem>
    )
  }

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <CalendarRange className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold">Your week</h2>
            <Badge variant="brand">Pro</Badge>
          </div>
          <p className="text-sm text-text-muted">
            The next 7 days · {formatMinutes(plannedTotal)} planned
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PlanMyWeek
            tasks={tasks}
            capacityMinutes={capacityMinutes}
            todayStr={today}
            estimate={estimateCost}
            busyByDate={byDate}
            onApply={applyWeekPlan}
          />
          <Link to="/">
            <Button variant="secondary" size="sm">
              <Sun className="h-4 w-4" aria-hidden /> Today
            </Button>
          </Link>
        </div>
      </header>

      {undo && undo.items.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface-2/50 px-4 py-2.5 text-sm">
          <span className="text-text-muted">
            {undo.verb} {undo.items.length} {undo.items.length === 1 ? 'task' : 'tasks'}.
          </span>
          <button
            type="button"
            onClick={undoMove}
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

      <WeekStrip days={days} />

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0">
          {days.map((day) => (
            <div key={day.date} id={dayAnchorId(day.date)} className="flex min-w-[85vw] sm:min-w-0">
              <DayColumn
                day={day}
                overdue={day.overdue.map(taskRow)}
                quickAdd={
                  <WeekQuickAdd
                    dayLabel={day.isToday ? 'Today' : `${day.weekday} ${day.dayOfMonth}`}
                    onAdd={(title) =>
                      createTask.mutate({
                        workspace_id: workspaceId,
                        title,
                        // Same auto-effort suggestion QuickAdd offers, applied
                        // directly so the day's meter still moves.
                        effort_minutes: suggestEffort(title, null)?.minutes ?? null,
                        // Quick-add is scoped to the column it sits in.
                        scheduled_for: day.date,
                      })
                    }
                  />
                }
              >
                {day.tasks.map(taskRow)}
              </DayColumn>
            </div>
          ))}
        </div>
      </DndContext>

      <TaskDialog open={!!editing} onClose={() => setEditing(null)} task={editing} />
    </div>
  )
}
