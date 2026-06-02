import { QueryClient } from '@tanstack/react-query'

/**
 * Shared TanStack Query client.
 * ALL server state in Todonado flows through TanStack Query — never store
 * server data in ad-hoc component state or context.
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
})
