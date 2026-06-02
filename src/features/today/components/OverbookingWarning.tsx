import { AlertTriangle, CalendarClock } from 'lucide-react'
import type { Task } from '@/types/database'
import { Button } from '@/components/ui'
import { formatMinutes } from '@/lib/format'

interface OverbookingWarningProps {
  overMinutes: number
  suggestions: Task[]
  onMoveSuggestions: (tasks: Task[]) => void
}

/** Honest, calm overbooking guard — informs and suggests, never blocks. */
export function OverbookingWarning({
  overMinutes,
  suggestions,
  onMoveSuggestions,
}: OverbookingWarningProps) {
  if (overMinutes <= 0 || suggestions.length === 0) return null

  return (
    <div className="animate-fade-in rounded-2xl border border-danger/30 bg-danger/5 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger">
          <AlertTriangle className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">
            You&rsquo;re over capacity by{' '}
            <span className="font-mono text-danger">{formatMinutes(overMinutes)}</span>.
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            A realistic day beats an aspirational one. Consider moving these to tomorrow:
          </p>
          <ul className="mt-3 space-y-1">
            {suggestions.map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-text-primary">{t.title}</span>
                {t.effort_minutes ? (
                  <span className="font-mono text-xs text-text-muted">
                    {formatMinutes(t.effort_minutes)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onMoveSuggestions(suggestions)}
          className="shrink-0"
        >
          <CalendarClock className="h-4 w-4" aria-hidden />
          Move {suggestions.length} to tomorrow
        </Button>
      </div>
    </div>
  )
}
