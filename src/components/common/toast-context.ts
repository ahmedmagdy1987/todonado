import { createContext, useContext } from 'react'

export interface ToastAction {
  label: string
  onClick?: () => void
  /**
   * Navigate to an in-app route instead of running a callback.
   *
   * A route rather than a `navigate` function because the emitters are not all
   * in the component tree — the `queryClient`'s MutationCache raises toasts
   * through `toastBridge` and has no router access. Describing the destination
   * lets the provider, which IS inside the router, do the navigating, so the
   * link stays a client-side transition instead of a full page load.
   */
  to?: string
}

export interface ToastOptions {
  variant?: 'default' | 'error'
  /** Optional inline action button (e.g. "Retry"). */
  action?: ToastAction
  /**
   * Override the auto-dismiss delay.
   *
   * Defaults stay as they were (3.5s, 6s for errors). Only set this when the
   * toast asks the user to READ something and then act on it: the entitlement
   * message is three sentences and a link, and six seconds is not enough time
   * to take that in and reach for the CTA on a phone.
   */
  durationMs?: number
}

export interface Toast {
  id: string
  message: string
  variant: 'default' | 'error'
  action?: ToastAction
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void
}

export const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>')
  }
  return ctx
}
