import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
}

/**
 * App-wide error boundary: a render error in any route shows a recoverable
 * fallback instead of white-screening the entire SPA. The fallback uses no app
 * context (just a styled button + reload), so it works even if a provider throws.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface for debugging; a production app would forward this to monitoring.
    console.error('Unhandled render error:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-text-primary">
        <div>
          <h1 className="font-display text-xl font-semibold">Something went wrong</h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
            An unexpected error interrupted the app. Reloading usually fixes it.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    )
  }
}
