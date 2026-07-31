import { supabase } from '@/lib/supabase'
import { todayISO } from '@/lib/date'
import { assertRealIds } from '@/lib/optimistic'
import {
  buildEventRow,
  shouldTrackDayReturned,
  type AnalyticsEvent,
  type TrackOptions,
} from './events'

/**
 * First-party behavioral tracking. `track()` is fire-and-forget: it never throws
 * and never blocks the UI — a failed insert is swallowed (best-effort signal).
 * No PII beyond user_id is ever sent (see ./events + the migration).
 *
 * The current user id is cached module-side (kept in sync by AuthProvider via
 * setAnalyticsUser) so call sites don't need to await the session. RLS still
 * gates the write: a signed-in client sends its JWT, so user_id must equal
 * auth.uid() (or be null) — exactly what the cached id is.
 */
let currentUserId: string | null = null

/** Keep the cached user id in sync with auth state. Called from AuthProvider. */
export function setAnalyticsUser(userId: string | null): void {
  currentUserId = userId
}

/** Record a behavioral event. Fire-and-forget; safe to call from anywhere —
 *  it never throws (telemetry must never break a real mutation or render). */
export function track(event: AnalyticsEvent, opts: TrackOptions = {}): void {
  try {
    const row = buildEventRow(event, currentUserId, opts)
    // Telemetry must never carry a placeholder into a uuid column. Throwing
    // here is caught by the surrounding try, so a half-saved row costs one
    // dropped event rather than a 22P02 — which is the right trade for a
    // fire-and-forget writer.
    assertRealIds(row)
    void supabase
      .from('events')
      .insert(row)
      .then(({ error }) => {
        if (error && import.meta.env.DEV) {
          console.debug('[analytics] track failed:', error.message)
        }
      })
  } catch {
    // Never let telemetry surface an error into the caller.
  }
}

const DAY_KEY = 'todonado.lastActiveDay'

/**
 * Emit `day_returned` at most once per local calendar day (the first session of
 * a new day). Persists the day in localStorage to dedupe; if storage is
 * unavailable it falls back to emitting once per load.
 */
export function trackDayReturnedOncePerDay(today: string = todayISO()): void {
  let shouldFire = true
  try {
    const last = localStorage.getItem(DAY_KEY)
    shouldFire = shouldTrackDayReturned(last, today)
    if (shouldFire) localStorage.setItem(DAY_KEY, today)
  } catch {
    // localStorage unavailable (private mode / SSR) — best-effort, fire once.
    shouldFire = true
  }
  if (shouldFire) track('day_returned')
}
