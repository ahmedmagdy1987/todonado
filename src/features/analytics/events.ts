/**
 * Pure event shaping for first-party analytics. No React, no I/O — unit-tested.
 * The I/O lives in ./track. Insert-only `events` table (no read-back); see
 * supabase/migrations/20260623120000_events.sql.
 *
 * The event set is mirrored by the DB CHECK constraint — keep the two in sync.
 */
export type AnalyticsEvent =
  | 'task_created'
  | 'effort_entered'
  | 'template_applied'
  | 'capacity_viewed'
  | 'over_capacity_hit'
  | 'task_completed'
  | 'focus_completed'
  | 'day_returned'
  | 'auto_planned'

export interface TrackOptions {
  /** A single boolean signal the wedge cares about, e.g. has_effort on task_created. */
  flag?: boolean | null
  /** Short, non-PII UI context, e.g. 'today' | 'inbox' | 'create'. Never task text. */
  source?: string | null
}

/** The exact row persisted to `public.events` (no PII beyond user_id). */
export interface EventRow {
  event: AnalyticsEvent
  user_id: string | null
  flag: boolean | null
  source: string | null
}

/** Normalize an event + the current user into the row we persist. Pure + tested. */
export function buildEventRow(
  event: AnalyticsEvent,
  userId: string | null,
  opts: TrackOptions = {},
): EventRow {
  return {
    event,
    user_id: userId ?? null,
    flag: opts.flag ?? null,
    source: opts.source ?? null,
  }
}

/** True when `today` differs from the last recorded active day (incl. first ever). */
export function shouldTrackDayReturned(lastDay: string | null, today: string): boolean {
  return lastDay !== today
}
