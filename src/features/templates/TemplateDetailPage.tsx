import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FolderPlus, Inbox, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useToast } from '@/components/common/toast-context'
import { cn } from '@/lib/utils'
import { formatEffort, getTemplate, templateIcon, totalEffortMinutes } from './catalog'
import { groupTemplateTasks } from './browse'
import { useApplyTemplate } from './useApplyTemplate'
import { applySuccessMessage, type ApplyTargetKind } from './apply'

const TARGETS: { kind: ApplyTargetKind; label: string; hint: string; Icon: LucideIcon }[] = [
  // Today first + default: it lights up the capacity meter immediately — the first "aha".
  { kind: 'today', label: 'Today', hint: 'Plan it into today', Icon: Sun },
  { kind: 'project', label: 'New project', hint: 'A project with these tasks', Icon: FolderPlus },
  { kind: 'inbox', label: 'Inbox', hint: 'Capture for later', Icon: Inbox },
]

function NotFound() {
  return (
    <div className="animate-fade-in space-y-4">
      <Link
        to="/templates"
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Templates
      </Link>
      <Card>
        <CardContent className="py-16 text-center text-text-muted">That template doesn&rsquo;t exist.</CardContent>
      </Card>
    </div>
  )
}

export function TemplateDetailPage() {
  const { templateId } = useParams()
  const template = templateId ? getTemplate(templateId) : undefined
  const { workspaceId } = useWorkspace()
  const apply = useApplyTemplate(workspaceId)
  const toast = useToast()
  const navigate = useNavigate()
  const [target, setTarget] = useState<ApplyTargetKind>('today')
  const [busy, setBusy] = useState(false)

  if (!template) return <NotFound />

  const Icon = templateIcon(template)
  const groups = groupTemplateTasks(template)
  const total = totalEffortMinutes(template)
  const count = template.tasks.length

  async function use() {
    // `!template` also narrows it for this async closure (the early return above
    // can't); in practice the button only renders once template is defined.
    if (busy || !template) return
    setBusy(true)
    try {
      const result = await apply(template, target)
      toast.show(applySuccessMessage(result))
      if (result.target === 'project' && result.projectId) navigate(`/projects/${result.projectId}`)
      else if (result.target === 'today') navigate('/')
      else navigate('/inbox')
    } catch {
      toast.show('Something went wrong adding this template. Please try again.')
      setBusy(false)
    }
  }

  return (
    // Preview/detail: cap at a comfortable reading width, centered in the wider frame.
    <div className="animate-fade-in mx-auto max-w-2xl space-y-6">
      <Link
        to="/templates"
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Templates
      </Link>

      <header className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold">{template.title}</h2>
          <p className="mt-1 text-text-muted">{template.description}</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="default">
              {count} {count === 1 ? 'task' : 'tasks'}
            </Badge>
            <span className="font-mono text-xs text-text-muted">~{formatEffort(total)} total effort</span>
          </div>
        </div>
      </header>

      {/* Target chooser + apply */}
      <Card>
        <CardContent className="space-y-4">
          <div role="group" aria-label="Where should these tasks go?" className="grid gap-2 sm:grid-cols-3">
            {TARGETS.map((t) => (
              <button
                key={t.kind}
                type="button"
                onClick={() => setTarget(t.kind)}
                aria-pressed={target === t.kind}
                className={cn(
                  'focus-ring rounded-xl border p-3 text-left transition-colors',
                  target === t.kind
                    ? 'border-brand/50 bg-brand-gradient-soft'
                    : 'border-white/10 hover:bg-surface-2/60',
                )}
              >
                <span className="flex items-center gap-2 font-medium text-text-primary">
                  <t.Icon className="h-4 w-4 text-brand" aria-hidden />
                  {t.label}
                </span>
                <span className="mt-0.5 block text-xs text-text-muted">{t.hint}</span>
              </button>
            ))}
          </div>
          <Button size="lg" className="w-full sm:w-auto" onClick={use} loading={busy}>
            Use this list
          </Button>
        </CardContent>
      </Card>

      {/* Preview: full task list with per-task effort + total */}
      <div className="space-y-5">
        {groups.map((group, gi) => (
          <section key={group.section ?? `g-${gi}`} className="space-y-2">
            {group.section && (
              <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">{group.section}</h3>
            )}
            <Card>
              <CardContent className="divide-y divide-white/5 p-0">
                {group.tasks.map((task, ti) => (
                  <div key={ti} className="flex items-start gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary">{task.title}</p>
                      {task.note && <p className="mt-0.5 text-xs text-text-muted">{task.note}</p>}
                    </div>
                    <span className="shrink-0 font-mono text-xs text-text-muted">
                      {formatEffort(task.effortMinutes)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        ))}
        <p className="text-right font-mono text-sm text-text-muted">
          Total ~{formatEffort(total)} · {count} {count === 1 ? 'task' : 'tasks'}
        </p>
      </div>
    </div>
  )
}
