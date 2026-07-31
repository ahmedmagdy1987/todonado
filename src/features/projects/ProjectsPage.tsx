import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, ChevronRight, FolderKanban } from 'lucide-react'
import { Button, Card, CardContent, Input } from '@/components/ui'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { selectByProject } from '@/features/tasks/selectors'
import { cn } from '@/lib/utils'
import { isOptimisticId } from '@/lib/optimistic'
import { StartFromTemplateCTA } from '@/features/templates/components/StartFromTemplateCTA'
import { LoadError } from '@/components/common/LoadError'
import { useProjects, useProjectMutations } from './api/useProjects'

const SWATCHES = ['#6C5CE7', '#4EA8FF', '#22D3A6', '#F59E0B', '#F43F5E', '#94A3B8']

export function ProjectsPage() {
  const { workspaceId } = useWorkspace()
  // `isPending` matters as much as `isError` here: without it `projects` is []
  // while the fetch is in flight and a returning user is told "No projects yet."
  // on every cold load. Same shape as the Free-cap bug — a conclusion drawn
  // from data that has not arrived.
  const { data: projects = [], isPending, isError, refetch } = useProjects(workspaceId)
  const { data: tasks = [] } = useTasks(workspaceId)
  const { createProject, archiveProject } = useProjectMutations(workspaceId)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(SWATCHES[0])

  const active = projects.filter((p) => p.status === 'active')
  const archived = projects.filter((p) => p.status === 'archived')

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    createProject.mutate({ workspace_id: workspaceId, name: trimmed, color })
    setName('')
  }

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <FolderKanban className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold">Projects</h2>
          <p className="text-sm text-text-muted">Organize work into projects and sections.</p>
        </div>
      </header>

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-surface p-4"
      >
        <div className="flex items-center gap-1.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Use color ${c}`}
              className={cn(
                'tap-44 h-6 w-6 rounded-full ring-offset-2 ring-offset-surface transition',
                color === c ? 'ring-2 ring-white/70' : 'ring-0 hover:scale-110',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name…"
          className="min-w-[12rem] flex-1"
          aria-label="New project name"
        />
        <Button type="submit" disabled={!name.trim()}>
          Create project
        </Button>
      </form>

      {isError ? (
        <LoadError message="We couldn't load your projects." onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-white/5 bg-surface-2/40"
            />
          ))}
        </div>
      ) : active.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <FolderKanban className="h-8 w-8 text-text-muted/40" aria-hidden />
            <p className="font-medium text-text-primary">No projects yet.</p>
            <p className="max-w-sm text-sm text-text-muted">
              Create your first project above to group related work into sections and tasks.
            </p>
            <StartFromTemplateCTA variant="outline" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((p) => {
            const count = selectByProject(tasks, p.id).filter((t) => t.status !== 'done').length
            return (
              <Card key={p.id} className="group relative transition-colors hover:border-white/10">
                {/* A project being created still carries a placeholder id, and
                    /projects/optimistic-… resolves to "Project not found." The
                    reconcile in useProjects closes this within one round trip;
                    this makes the dead link unreachable in the meantime. */}
                <Link
                  to={`/projects/${p.id}`}
                  onClick={(e) => isOptimisticId(p.id) && e.preventDefault()}
                  aria-disabled={isOptimisticId(p.id) || undefined}
                  className={cn(
                    'focus-ring block rounded-2xl p-4',
                    isOptimisticId(p.id) && 'pointer-events-none opacity-70',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                      {p.name}
                    </span>
                    <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden />
                  </div>
                  <p className="mt-2 font-mono text-xs text-text-muted">
                    {count} open {count === 1 ? 'task' : 'tasks'}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => archiveProject.mutate({ id: p.id, archived: true })}
                  aria-label="Archive project"
                  title="Archive project"
                  className="tap-44 focus-ring absolute right-3 top-3 rounded-lg p-1.5 text-text-muted opacity-100 transition-opacity hover:bg-surface-2/60 hover:text-text-primary md:opacity-0 md:group-hover:opacity-100"
                >
                  <Archive className="h-4 w-4" aria-hidden />
                </button>
              </Card>
            )
          })}
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            Archived
          </h3>
          <div className="space-y-1">
            {archived.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-xl border border-white/5 bg-surface/50 px-3 py-2"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="flex-1 truncate text-sm text-text-muted">{p.name}</span>
                <button
                  type="button"
                  onClick={() => archiveProject.mutate({ id: p.id, archived: false })}
                  className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-accent hover:bg-accent/10"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" aria-hidden /> Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
