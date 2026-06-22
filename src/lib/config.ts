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
  /**
   * Auto-effort estimation — when a task has no effort yet, suggest an
   * `effort_minutes` value (from the user's own history of similar tasks, else a
   * transparent keyword heuristic) as a one-tap chip. Always a visible SUGGESTION
   * the user accepts/overrides; never sets effort silently. Default ON; set to
   * false to hide the suggestion chip everywhere (no other behavior changes).
   */
  autoEffort: true,
  /**
   * Auto-plan-my-day — a "Plan my day" button on Today that deterministically
   * fills today within the REMAINING capacity (priority → due → effort, greedy,
   * never over) and schedules the chosen tasks, behind a preview/confirm. Pure +
   * unit-tested; no AI. Default ON; set to false to hide the button (Today's
   * existing capacity/roll-over behavior is untouched either way).
   */
  autoPlan: true,
  /**
   * Calendar busy-import (ICS) — let a user add an .ics calendar (file upload =
   * reliable; URL subscribe = best-effort, often CORS-blocked) in Settings, so
   * today's timed meetings subtract from available capacity alongside task effort.
   * Pure parser + capacity math, unit-tested; a calendar failure NEVER breaks the
   * meter (falls back to task-only capacity). Default ON; set to false to hide the
   * Settings section and ignore all calendar sources (capacity = tasks only).
   */
  calendarImport: true,
} as const
