import { MutationCache, QueryClient } from '@tanstack/react-query'
import { notifyToast } from '@/components/common/toastBridge'

/** Compile-time-checked keys for a mutation's `meta` (used by the global onError). */
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Suppress the global error toast (the flow renders its own error). */
      skipErrorToast?: boolean
      /** Custom error-toast message for this mutation. */
      errorMessage?: string
      /** Don't offer a Retry action (non-idempotent mutations, e.g. an insert). */
      noRetry?: boolean
    }
  }
}

const DEFAULT_MUTATION_ERROR = 'Something went wrong saving your changes — please try again.'

/**
 * Shared TanStack Query client.
 * ALL server state in Todonado flows through TanStack Query — never store
 * server data in ad-hoc component state or context.
 *
 * Global mutation-error feedback: every useMutation that fails (after its own
 * optimistic rollback) raises an error toast here, so a failed save/update/
 * delete is never silent. A mutation can opt out or customize via
 * `meta: { skipErrorToast: true }` / `meta: { errorMessage: '…' }` (e.g. flows
 * that already render their own inline error).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
  mutationCache: new MutationCache({
    onError: (_error, variables, _context, mutation) => {
      const meta = mutation.meta
      if (meta?.skipErrorToast) return
      const message = meta?.errorMessage ?? DEFAULT_MUTATION_ERROR
      // Offer Retry only for retriable mutations (skip non-idempotent inserts).
      const canRetry = variables !== undefined && !meta?.noRetry
      notifyToast(message, {
        variant: 'error',
        // Retry re-runs the same mutation (re-applies its optimistic update too).
        action: canRetry
          ? { label: 'Retry', onClick: () => void mutation.execute(variables).catch(() => {}) }
          : undefined,
      })
    },
  }),
})
