/** App-wide configuration & feature flags. */

/** Default daily planning capacity (minutes) when a profile has none. */
export const DEFAULT_DAILY_CAPACITY_MINUTES = 360

/**
 * Supabase realtime sync for the active workspace. Safe to disable if it ever
 * causes instability — the app remains fully functional via TanStack Query.
 */
export const ENABLE_REALTIME = true

/**
 * Feature flags for gated / optional surfaces. Flip a flag off to fully remove
 * that surface (nav entry + routes + hub) with NO impact on the core app
 * (Today/Inbox/Projects/Focus/Insights). Each flag is self-contained and
 * reversible by design.
 */
export const FEATURES = {
  /**
   * The "Focus & Calm" wellness suite (breathwork, sleep sounds, guided
   * meditation, supplement/medication tracker). Default ON for signed-in users;
   * set to false to hide the entire in-app suite without touching the core.
   */
  wellness: true,
  /**
   * "Start from a template" — a catalog of ready-made, effort-tagged task lists
   * users can apply in one click. Content-only (no DB); free, to drive
   * activation. Default ON; set to false to hide the Templates nav item, the
   * /templates routes, and the empty-state CTAs without touching the core.
   */
  templates: true,
} as const
