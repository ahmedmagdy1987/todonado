import type { ToastOptions } from './toast-context'

/**
 * Bridge so non-React code (e.g. the TanStack `queryClient`'s MutationCache,
 * created outside the component tree) can raise a toast through the mounted
 * ToastProvider. The provider registers its `show` here; emitters call
 * `notifyToast`. No-op until a provider is mounted.
 */
type ShowFn = (message: string, options?: ToastOptions) => void

let handler: ShowFn | null = null

/** Register the active toast `show`; returns a cleanup that unregisters it. */
export function registerToast(fn: ShowFn): () => void {
  handler = fn
  return () => {
    if (handler === fn) handler = null
  }
}

export function notifyToast(message: string, options?: ToastOptions): void {
  handler?.(message, options)
}
