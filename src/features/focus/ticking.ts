import type { FocusSession } from '@/types/database'

/**
 * WHEN THE COUNTDOWN TICK MAY SOUND — the whole rule, as one pure function.
 *
 * ── WHY THIS IS A MODULE AND NOT AN `if` IN THE COMPONENT ──────────────────
 *
 * Every requirement for this feature is a statement about WHEN audio is allowed:
 * not while paused, not after End early, not once the timer completes, never
 * when the master switch is off, off by default. Left inline they would be a
 * boolean expression nobody could test, in a component this repo has no
 * infrastructure to render (the unit suite runs in `node`, with no DOM).
 *
 * Pulled out here, every one of them is a table row in `ticking.test.ts`.
 *
 * ── WHAT DELIBERATELY IS NOT HERE ──────────────────────────────────────────
 *
 * No clock, no interval, no scheduling. The tick is emitted by the SAME
 * per-second re-render that already drives the visible countdown (`useNow`), so
 * there is exactly one timing source in the feature and the sound cannot drift
 * away from the number on screen. That also means:
 *
 *   • pausing stops the ticks for free — `useNow(!paused)` stops re-rendering,
 *     so no second elapses, so nothing fires;
 *   • a backgrounded tab cannot queue a burst — the interval is throttled, and
 *     on return the elapsed value jumps ONCE, producing one tick rather than one
 *     per skipped second;
 *   • there is no scheduler to leak, duplicate, or tear down.
 */
export interface TickConditions {
  /** The user's countdown-ticking preference (`prefs.tick`). Defaults to false. */
  enabled: boolean
  /** The master "Sounds & notices" switch (`prefs.sound`). */
  masterSound: boolean
  /** The session is paused. */
  paused: boolean
  /** The countdown has reached zero. */
  complete: boolean
  /** An end is already in flight (End early, or the completion write). */
  ending: boolean
  /** The row's status. Only a running session ticks. */
  status: FocusSession['status']
}

export function shouldTick(c: TickConditions): boolean {
  if (!c.enabled) return false
  // The master switch wins over every local toggle, by design.
  if (!c.masterSound) return false
  if (c.paused) return false
  // `complete` and `ending` are separate: the timer can reach zero before the
  // end write starts, and End early begins an end while time is still on the
  // clock. Either one must silence it immediately.
  if (c.complete || c.ending) return false
  return c.status === 'running'
}
