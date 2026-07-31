import { useQuery } from '@tanstack/react-query'
import { FEATURES } from '@/lib/config'
import { useAuth } from '@/features/auth/auth-context'
import { busyMinutesByDate } from '../ics'
import { useCalendarSources } from './useCalendarSources'
import { fetchUrlCalendars } from './fetchCalendarProxy'

const HOUR = 60 * 60_000
const MAX_BUSY = 24 * 60

export interface CalendarBusyRange {
  /**
   * False until the calendar has actually been consulted. See the note in the
   * hook: planning inside that window builds on a day it believes is empty.
   */
  ready: boolean

  /** date (yyyy-MM-dd) → busy minutes. Missing key ⇒ 0. */
  byDate: Map<string, number>
  hadError: boolean
  proRequired: boolean
  enabled: boolean
}

const EMPTY: CalendarBusyRange = {
  ready: true,
  byDate: new Map(),
  hadError: false,
  proRequired: false,
  enabled: false,
}

/**
 * Calendar busy-minutes for a RANGE of local days — what the week view needs.
 *
 * Deliberately the same shape as `useCalendarBusy`, and it reuses exactly the
 * same pieces: the same sources query, the same server-side proxy for subscribed
 * URLs, and the same `busyMinutesForDay` arithmetic (via `busyMinutesByDate`,
 * which parses each calendar once for all seven days instead of seven times).
 *
 * NEVER throws: a calendar problem must never break the week's meters.
 */
export function useCalendarBusyByDate(dates: string[]): CalendarBusyRange {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const { sources, isPending: sourcesPending } = useCalendarSources()
  const enabled = FEATURES.calendarImport && !!userId && sources.length > 0 && dates.length > 0
  const sig = sources.map((s) => `${s.id}:${s.updated_at}`).join('|')
  const range = dates.join(',')
  const hasUrlSources = sources.some((s) => s.kind === 'url')

  const query = useQuery({
    queryKey: ['calendar-busy-range', userId, range, sig],
    enabled,
    staleTime: 12 * HOUR,
    retry: false,
    queryFn: async ({ signal }) => {
      const proxy = hasUrlSources
        ? await fetchUrlCalendars(signal)
        : { byId: new Map<string, string>(), hadError: false, proRequired: false }

      const totals = new Map<string, number>()
      for (const date of dates) totals.set(date, 0)

      for (const source of sources) {
        const text = source.kind === 'url' ? (proxy.byId.get(source.id) ?? null) : source.ics_text
        if (!text) continue
        const perDate = busyMinutesByDate(text, dates)
        for (const [date, minutes] of perDate) {
          totals.set(date, Math.min(MAX_BUSY, (totals.get(date) ?? 0) + minutes))
        }
      }
      return { totals, hadError: proxy.hadError, proRequired: proxy.proRequired }
    },
  })

  if (!enabled) return { ...EMPTY, ready: !FEATURES.calendarImport || !sourcesPending }
  return {
    ready: !sourcesPending && !query.isPending,
    byDate: query.data?.totals ?? new Map(),
    hadError: query.data?.hadError ?? false,
    proRequired: query.data?.proRequired ?? false,
    enabled,
  }
}
