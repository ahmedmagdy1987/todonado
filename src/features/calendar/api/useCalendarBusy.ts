import { useQuery } from '@tanstack/react-query'
import { FEATURES } from '@/lib/config'
import { useAuth } from '@/features/auth/auth-context'
import { busyMinutesFromIcs } from '../ics'
import { useCalendarSources } from './useCalendarSources'
import { fetchUrlCalendars } from './fetchCalendarProxy'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const MAX_BUSY = 24 * 60

/**
 * How long a fetched set of subscribed calendars stays fresh.
 *
 * The query key carries `todayStr`, so a new local day always refetches — that
 * IS the daily refresh. Within a day, 12h means a long-lived tab re-checks about
 * twice; a fresh page load always fetches, because the cache starts empty.
 */
export const URL_CALENDAR_STALE_MS = 12 * HOUR

export interface CalendarBusy {
  /**
   * False until the calendar has actually been consulted. See the note in the
   * hook: planning inside that window builds on a day it believes is empty.
   */
  ready: boolean

  /** Today's calendar busy minutes (0 when disabled / no sources / not loaded). */
  busyMinutes: number
  /** A source failed to load — surface a soft notice. */
  hadError: boolean
  /** The user has URL sources but their plan doesn't include live sync. */
  proRequired: boolean
  /** The feature is on AND the user has at least one source. */
  enabled: boolean
  /** When the current data was produced (for "last refreshed"), or null. */
  updatedAt: number | null
  /** Force a refetch — the Settings "Refresh now" action. */
  refresh: () => void
}

/**
 * Today's calendar busy-minutes across the user's sources.
 *
 * 'file' sources parse their stored .ics text locally (reliable, offline).
 * 'url' sources are fetched through /api/calendar-fetch — a SERVER-side proxy,
 * because providers don't send CORS headers on .ics endpoints, which made the
 * old in-browser fetch fail for essentially every real Google/Outlook link.
 *
 * NEVER throws: a calendar problem can't break the capacity meter. If the plan
 * doesn't include live URL sync the proxy answers 403 and those sources simply
 * contribute 0 — reported as `proRequired`, not as an error.
 */
export function useCalendarBusy(todayStr: string): CalendarBusy {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const { sources, isPending: sourcesPending } = useCalendarSources()
  const enabled = FEATURES.calendarImport && !!userId && sources.length > 0
  const sig = sources.map((s) => `${s.id}:${s.updated_at}`).join('|')
  const hasUrlSources = sources.some((s) => s.kind === 'url')

  const query = useQuery({
    queryKey: ['calendar-busy', userId, todayStr, sig],
    enabled,
    staleTime: hasUrlSources ? URL_CALENDAR_STALE_MS : 5 * MINUTE,
    retry: false,
    queryFn: async ({ signal }) => {
      // One proxy round-trip covers every subscribed calendar.
      const proxy = hasUrlSources
        ? await fetchUrlCalendars(signal)
        : { byId: new Map<string, string>(), hadError: false, proRequired: false }

      let busyMinutes = 0
      for (const s of sources) {
        const text = s.kind === 'url' ? (proxy.byId.get(s.id) ?? null) : s.ics_text
        if (text) busyMinutes += busyMinutesFromIcs(text, todayStr)
      }
      return {
        busyMinutes: Math.min(MAX_BUSY, busyMinutes),
        hadError: proxy.hadError,
        proRequired: proxy.proRequired,
      }
    },
  })

  return {
    ready: !FEATURES.calendarImport || (!sourcesPending && (!enabled || !query.isPending)),
    busyMinutes: enabled ? (query.data?.busyMinutes ?? 0) : 0,
    hadError: enabled ? (query.data?.hadError ?? false) : false,
    proRequired: enabled ? (query.data?.proRequired ?? false) : false,
    enabled,
    updatedAt: query.dataUpdatedAt || null,
    refresh: () => void query.refetch(),
  }
}
