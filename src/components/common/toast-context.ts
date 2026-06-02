import { createContext, useContext } from 'react'

export interface Toast {
  id: string
  message: string
}

interface ToastContextValue {
  show: (message: string) => void
}

export const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>')
  }
  return ctx
}
