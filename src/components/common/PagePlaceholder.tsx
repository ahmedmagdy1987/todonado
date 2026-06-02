import type { LucideIcon } from 'lucide-react'
import { Badge, Card, CardContent } from '@/components/ui'

interface PagePlaceholderProps {
  icon: LucideIcon
  title: string
  description: string
  hint?: string
}

/**
 * Shared scaffold for routes whose feature ships post-foundation.
 * Keeps the shell consistent while clearly signalling "not built yet".
 */
export function PagePlaceholder({
  icon: Icon,
  title,
  description,
  hint,
}: PagePlaceholderProps) {
  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <p className="text-sm text-text-muted">{description}</p>
        </div>
        <Badge variant="brand" className="ml-auto">
          Coming in MVP
        </Badge>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Icon className="h-8 w-8 text-text-muted/40" aria-hidden />
          <p className="font-medium text-text-primary">Scaffolded &amp; ready</p>
          <p className="max-w-sm text-sm text-text-muted">
            {hint ?? 'This area is wired into the shell, awaiting its feature build.'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
