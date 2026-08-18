import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ToastProvider } from '@/components/common/ToastProvider'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { EntitlementBridge } from '@/features/billing/components/EntitlementBridge'
import { AppRoutes } from '@/routes/AppRoutes'

/**
 * `ToastProvider` sits INSIDE `BrowserRouter` so a toast can carry a real
 * in-app link (the upgrade CTA on a Free-limit message) and navigate without a
 * full page load. It stays above `AuthProvider`, which is where every consumer
 * of `useToast` already lives, so nothing else moves.
 *
 * `EntitlementBridge` renders nothing; it publishes the resolved plan so the
 * queryClient's error handler can tell a Free ceiling from entitlement drift.
 * It is inside `AuthProvider` because it needs the session.
 */
export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <EntitlementBridge />
              <AppRoutes />
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
