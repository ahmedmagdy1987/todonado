import { useCallback, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { ToastContext, type Toast } from './toast-context'

/** Minimal, calm toast stack (auto-dismiss). Brief, non-blocking feedback. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string) => {
      const id = crypto.randomUUID()
      setToasts((current) => [...current, { id, message }])
      setTimeout(() => dismiss(id), 3500)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-white/10 bg-surface-2 px-4 py-2.5 text-sm text-text-primary shadow-elevation-lg animate-fade-in"
          >
            <span className="min-w-0 flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="focus-ring shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
