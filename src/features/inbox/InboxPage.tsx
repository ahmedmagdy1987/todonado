import { Inbox as InboxIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { useTaskMutations } from '@/features/tasks/api/useTaskMutations'
import { useEffortSuggester } from '@/features/tasks/api/useEffortSuggester'
import { selectInbox } from '@/features/tasks/selectors'
import { QuickAdd } from '@/features/tasks/components/QuickAdd'
import { TaskListView } from '@/features/tasks/components/TaskListView'
import { StartFromTemplateCTA } from '@/features/templates/components/StartFromTemplateCTA'
import { LoadError } from '@/components/common/LoadError'
import { todayISO } from '@/lib/date'

export function InboxPage() {
  const { workspaceId } = useWorkspace()
  const { data: tasks = [], isPending, isError, refetch } = useTasks(workspaceId)
  const { createTask, updateTask } = useTaskMutations(workspaceId)
  const suggestEffort = useEffortSuggester(workspaceId)
  const inbox = selectInbox(tasks)

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <InboxIcon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold">Inbox</h2>
          <p className="text-sm text-text-muted">Capture everything. Triage it later.</p>
        </div>
        <span className="ml-auto font-mono text-sm text-text-muted">{inbox.length}</span>
      </header>

      <QuickAdd
        autoFocus
        placeholder="Capture a task…"
        suggest={suggestEffort}
        onAdd={(v) =>
          createTask.mutate({
            workspace_id: workspaceId,
            title: v.title,
            effort_minutes: v.effort_minutes,
            due_date: v.due_date,
            position: inbox.length,
          })
        }
      />

      {isError ? (
        <LoadError message="We couldn't load your inbox." onRetry={() => void refetch()} />
      ) : !isPending ? (
        <TaskListView
          workspaceId={workspaceId}
          tasks={inbox}
          viewKey="inbox"
          onScheduleToday={(t) => updateTask.mutate({ id: t.id, patch: { scheduled_for: todayISO() } })}
          emptyState={<InboxEmpty />}
        />
      ) : null}
    </div>
  )
}

function InboxEmpty() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <InboxIcon className="h-8 w-8 text-text-muted/40" aria-hidden />
        <p className="font-medium text-text-primary">Inbox zero.</p>
        <p className="max-w-sm text-sm text-text-muted">
          Capture anything on your mind above. Add an effort estimate to plan it into your day later.
        </p>
        <StartFromTemplateCTA variant="outline" />
      </CardContent>
    </Card>
  )
}
