import { MutationCache, QueryClient } from '@tanstack/react-query'
import { notifyToast } from '@/components/common/toastBridge'
import { readEntitlements } from '@/features/billing/entitlementBridge'
import {
  driftDiagnostics,
  resolveFreeLimitOutcome,
} from '@/features/billing/freeLimitRecovery'
import { UPGRADE_CTA, UPGRADE_ROUTE } from '@/features/billing/upgradeCopy'
import { STILL_SAVING_ERROR } from './optimistic'

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

const DEFAULT_MUTATION_ERROR = 'Something went wrong saving your changes. Please try again.'

/**
 * Whether the error toast should offer a one-click Retry. Only for mutations that
 * are safe to re-run: a mutation with `variables` (so it can be replayed) that has
 * NOT opted out via `meta.noRetry`. Non-idempotent inserts set `noRetry` so a
 * commit-then-lost-response + Retry can't silently duplicate a row.
 */
export function shouldOfferRetry(
  meta: { noRetry?: boolean } | undefined,
  variables: unknown,
): boolean {
  return variables !== undefined && !meta?.noRetry
}

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

      /*
       * COMMERCIAL REJECTIONS ARE ANSWERED BEFORE ORDINARY FAILURES.
       *
       * The count triggers refuse a create with a structured message, and until
       * this branch existed the user got "Something went wrong saving your
       * changes" — which reads as a bug in a moment when nothing is broken. The
       * parser is strict and returns null for everything it does not positively
       * recognise, so a genuine database or network error still falls through to
       * the generic path below and is never dressed up as a sales message.
       *
       * The plan is read from the entitlement bridge rather than the error,
       * because a Free ceiling and entitlement drift produce the SAME message on
       * the wire and only the client knows which one it is looking at.
       */
      const limit = resolveFreeLimitOutcome(_error, readEntitlements())
      if (limit?.kind === 'upgrade') {
        notifyToast(limit.message, {
          variant: 'error',
          /*
           * The CTA replaces Retry, which is the correct behaviour rather than a
           * side effect: re-running a mutation the server refused on entitlement
           * grounds can only be refused again. (These four inserts also carry
           * `meta.noRetry`, so nothing offers one anyway.)
           *
           * No `upgrade_intents` row is written here. The notice on the page
           * records intent because a user opened that page and clicked; this
           * toast is raised automatically by a failure, and that table has no
           * delete policy, so a row written from here could never be taken back
           * if the attribution turned out to be wrong.
           */
          action: { label: UPGRADE_CTA, to: UPGRADE_ROUTE },
          // Three sentences and a link need longer than a six-second glance.
          durationMs: 12_000,
        })
        return
      }
      if (limit?.kind === 'inconsistent') {
        // A paying customer is never told to buy what they already have. This
        // is a fault on our side, so it is reported as one and logged loudly.
        const { message, detail } = driftDiagnostics(limit)
        console.error(message, detail)
      }
      // "That's still being saved" is an answer; "Something went wrong" is not.
      // The guards in src/lib/optimistic.ts throw a message written FOR the
      // user, so let it through instead of flattening it to the generic text.
      const isStillSaving = _error instanceof Error && _error.message === STILL_SAVING_ERROR
      const message = meta?.errorMessage ?? (isStillSaving ? STILL_SAVING_ERROR : DEFAULT_MUTATION_ERROR)
      // Offer Retry only for retriable mutations (skip non-idempotent inserts).
      // Never for a still-saving refusal: the variables still hold the same
      // placeholder id, so Retry could only fail again in exactly the same way.
      const canRetry = shouldOfferRetry(meta, variables) && !isStillSaving
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
