/** App-wide configuration & feature flags. */

/** Default daily planning capacity (minutes) when a profile has none. */
export const DEFAULT_DAILY_CAPACITY_MINUTES = 360

/**
 * Supabase realtime sync for the active workspace. Safe to disable if it ever
 * causes instability — the app remains fully functional via TanStack Query.
 */
export const ENABLE_REALTIME = true
