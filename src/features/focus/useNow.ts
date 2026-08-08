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
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    /*
     * RE-SYNC THE MOMENT IT REACTIVATES, before the first interval fires.
     *
     * Without this, resuming left `now` holding the value it froze on at PAUSE
     * for up to a full second, while the resume write had already grown
     * `accumulated_paused_seconds`. The screen therefore showed a countdown
     * computed from a stale `now` against a fresh total — it jumped UP by the
     * length of the pause and then snapped back on the next tick. One call, and
     * the first frame after Resume is correct.
     */
    tick()
    const id = setInterval(tick, 1000)
    // Re-sync immediately on refocus so a session backgrounded past 0 completes
    // promptly (the interval is throttled while the tab is hidden).
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active])
  return now
}
