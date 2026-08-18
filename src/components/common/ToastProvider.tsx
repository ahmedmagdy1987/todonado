import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ToastContext, type Toast, type ToastOptions } from './toast-context'
import { registerToast } from './toastBridge'

/** Shared by the button and link forms so the two cannot drift apart. */
const ACTION_CLASS =
  'focus-ring inline-flex min-h-[44px] shrink-0 items-center rounded px-1.5 text-xs font-medium text-accent hover:underline'

/** Minimal, calm toast stack (auto-dismiss). Brief, non-blocking feedback. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      const id = crypto.randomUUID()
      const variant = options?.variant ?? 'default'
      setToasts((current) => [...current, { id, message, variant, action: options?.action }])
      // Errors linger a little longer so the user can read them / hit retry.
      const fallback = variant === 'error' ? 6000 : 3500
      setTimeout(() => dismiss(id), options?.durationMs ?? fallback)
    },
    [dismiss],
  )

  // Let non-React code (queryClient mutation errors) raise toasts via the bridge.
  useEffect(() => registerToast(show), [show])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* Above the mobile bottom nav (fixed, h-16, z-40). At `bottom-6` a toast
          sat directly on the Today/Inbox/Projects/Focus tabs for its whole
          lifetime — and toasts are where every Undo lives. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border bg-surface-2 px-4 py-2.5 text-sm text-text-primary shadow-elevation-lg animate-fade-in',
              toast.variant === 'error' ? 'border-danger/30' : 'border-white/10',
            )}
          >
            {toast.variant === 'error' && (
              <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden />
            )}
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.action &&
              /* A real 44px target either way: this is the button people reach
                 for on a phone, and it used to be ~20px tall. The padding is
                 vertically centred so the toast keeps its existing height. */
              (toast.action.to ? (
                <Link
                  to={toast.action.to}
                  onClick={() => {
                    toast.action?.onClick?.()
                    dismiss(toast.id)
                  }}
                  className={ACTION_CLASS}
                >
                  {toast.action.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick?.()
                    dismiss(toast.id)
                  }}
                  className={ACTION_CLASS}
                >
                  {toast.action.label}
                </button>
              ))}
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="focus-ring inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded text-text-muted hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
