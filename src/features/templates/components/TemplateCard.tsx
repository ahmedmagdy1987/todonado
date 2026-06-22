import { Link } from 'react-router-dom'
import { Badge, Card, CardContent } from '@/components/ui'
import { formatEffort, templateIcon, totalEffortMinutes } from '../catalog'
import type { Template } from '../types'

export function TemplateCard({ template }: { template: Template }) {
  const Icon = templateIcon(template)
  const count = template.tasks.length
  const total = formatEffort(totalEffortMinutes(template))

  return (
    <Link
      to={`/templates/${template.id}`}
      aria-label={`Preview ${template.title}`}
      className="focus-ring group block h-full rounded-2xl"
    >
      <Card className="h-full transition-colors hover:bg-surface-2/40">
        <CardContent className="flex h-full flex-col gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold">{template.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-text-muted">{template.description}</p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="default">
              {count} {count === 1 ? 'task' : 'tasks'}
            </Badge>
            <span className="font-mono text-xs text-text-muted">~{total}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
