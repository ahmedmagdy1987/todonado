import { useEffect, useState } from 'react'

/**
 * A `Date` that refreshes every `ms`, for the live clean-streak clock.
 *
 * DRIFT-RESISTANT BY CONSTRUCTION: it stores a fresh `new Date()` each tick
 * rather than adding an interval's worth of time to a running total, so a
 * throttled background tab, a slow frame, or a machine waking from sleep
 * simply produces the correct time on the next tick instead of a counter that
 * has silently fallen behind. Same principle as the Focus timer deriving
 * elapsed from timestamps.
 *
 * Also re-reads immediately when the tab becomes visible again, so a phone
 * unlocked after an hour shows the right number on the first paint rather than
 * up to `ms` later.
 */
export function useTick(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms)
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ms])

  return now
}
