import { createContext, useContext } from 'react'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  variant?: 'default' | 'error'
  /** Optional inline action button (e.g. "Retry"). */
  action?: ToastAction
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
