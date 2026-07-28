import { useCallback, useState } from 'react'
import { isDigestDismissed } from './digest'

/**
 * Per-local-day dismissal for the "Start your day" briefing, persisted in
 * localStorage under the repo's `todonado.<key>` convention — the same
 * day-stamped pattern `trackDayReturnedOncePerDay` uses.
 *
 * Storing the DAY rather than a boolean is what makes the card return by itself
 * tomorrow: there is no reset step and no expiry job, the stamp simply stops
 * matching. Defensive against unavailable storage (private mode), where the
 * dismissal degrades to in-memory for the session.
 */
const KEY = 'todonado.digest.dismissed'

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function write(day: string | null): void {
  try {
    if (day == null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, day)
  } catch {
    // storage unavailable — the in-memory state below still holds for this session
  }
}

export function useDigestDismissal(todayStr: string): {
  dismissed: boolean
  dismiss: () => void
  reopen: () => void
} {
  const [dismissedDay, setDismissedDay] = useState<string | null>(read)

  const dismiss = useCallback(() => {
    write(todayStr)
    setDismissedDay(todayStr)
  }, [todayStr])

  const reopen = useCallback(() => {
    write(null)
    setDismissedDay(null)
  }, [])

  return { dismissed: isDigestDismissed(dismissedDay, todayStr), dismiss, reopen }
}
