import { AlertTriangle } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'

/**
 * Friendly inline state for a failed data fetch, with a retry. Prevents a query
 * error from masquerading as an empty ("you're all clear") state.
 */
export function LoadError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-danger/70" aria-hidden />
        <div>
          <p className="font-medium text-text-primary">Couldn&rsquo;t load your data</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
            {message ?? 'Check your connection and try again.'}
          </p>
        </div>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
