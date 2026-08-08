import { useEffect, useState } from 'react'

/**
 * A `now` that refreshes every second while `active`.
 *
 * Moved out of `RunningView` unchanged so the break clock uses the SAME tick
 * source as the sprint clock — two timers in one feature drifting apart would be
 * the exact bug this whole module is designed to avoid.
 *
 * It is only a re-render trigger, never the measurement: every displayed value
 * is derived from `now` by a pure function, so a throttled or stopped interval
 * costs at most a late repaint and never a wrong number.
 *
 * ── `phaseMs`: RENDER ON THE VALUE'S OWN BOUNDARY, NOT ON A FIXED CADENCE ───
 *
 * Without it, ticks land every 1000 ms from whenever the effect happened to run,
 * which is unrelated to when the displayed second actually changes. The number
 * on screen is then correct but LATE — by up to a second — and that lateness is
 * not cosmetic. Pausing has to record an instant, and the two candidates are the
 * last render (stale) and the click (true). Stamping the render attributes up to
 * a second of real focus to the pause; stamping the click makes the frozen value
 * disagree with what is on screen, so the countdown visibly moves at Pause or at
 * Resume. Both were measured: at 1 Hz the first loses ~0.5s of focus PER PAUSE,
 * compounding to 98 seconds over 200 pause/resume cycles.
 *
 * Passing the instant the derived value last changed collapses the choice. Ticks
 * are then scheduled ON the boundaries where the displayed second changes, so
 * between two renders the true value cannot have moved: the display is stale in
 * TIME but never in VALUE. Stamping the click is therefore both exact and
 * jump-free, and the compounding error goes to zero.
 *
 * Each tick re-derives its own deadline from `Date.now()`, so a late or throttled
 * firing corrects itself on the next one instead of accumulating.
 */
export function useNow(active: boolean, phaseMs?: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())

    /*
     * RE-SYNC THE MOMENT IT REACTIVATES, before the first tick is scheduled.
     *
     * Without this, resuming left `now` holding the value it froze on at PAUSE
     * for up to a full second, while the resume write had already grown
     * `accumulated_paused_seconds`. The screen therefore showed a countdown
     * computed from a stale `now` against a fresh total — it jumped UP by the
     * length of the pause and then snapped back on the next tick.
     */
    tick()

    let timeout: ReturnType<typeof setTimeout> | undefined
    let interval: ReturnType<typeof setInterval> | undefined

    if (phaseMs === undefined || !Number.isFinite(phaseMs)) {
      // No phase to align to (the break clock): the plain cadence is correct.
      interval = setInterval(tick, 1000)
    } else {
      const schedule = () => {
        // Milliseconds until the next instant at which the derived second ticks
        // over. `% 1000` is normalised because `phaseMs` may be ahead of `now`.
        const sinceBoundary = (((Date.now() - phaseMs) % 1000) + 1000) % 1000
        timeout = setTimeout(() => {
          tick()
          schedule()
        }, 1000 - sinceBoundary)
      }
      schedule()
    }

    // Re-sync immediately on refocus so a session backgrounded past 0 completes
    // promptly (timers are throttled while the tab is hidden).
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timeout !== undefined) clearTimeout(timeout)
      if (interval !== undefined) clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active, phaseMs])
  return now
}
