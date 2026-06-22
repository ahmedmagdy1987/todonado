import { useQuery } from '@tanstack/react-query'
import { FEATURES } from '@/lib/config'
import { useAuth } from '@/features/auth/auth-context'
import { busyMinutesFromIcs } from '../ics'
import { useCalendarSources } from './useCalendarSources'

const MINUTE = 60_000
const MAX_BUSY = 24 * 60

export interface CalendarBusy {
  /** Today's calendar busy minutes (0 when disabled / no sources / not loaded). */
  busyMinutes: number
  /** A 'url' source failed to load (CORS/network) — surface a soft notice. */
  hadError: boolean
  /** The feature is on AND the user has at least one source. */
  enabled: boolean
}

/** webcal:// → https://; trim. */
function normalizeIcsUrl(url: string): string {
  return url.trim().replace(/^webcal:\/\//i, 'https://')
}

async function fetchIcs(url: string): Promise<string> {
  const res = await fetch(normalizeIcsUrl(url), { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

/**
 * Today's calendar busy-minutes across the user's sources. 'file' sources parse
 * the stored .ics text (reliable); 'url' sources fetch best-effort (browser CORS
 * usually blocks third-party .ics — a failure just marks hadError and that source
 * contributes 0). NEVER throws — a calendar problem can't break the meter.
 */
export function useCalendarBusy(todayStr: string): CalendarBusy {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const { sources } = useCalendarSources()
  const enabled = FEATURES.calendarImport && !!userId && sources.length > 0
  const sig = sources.map((s) => `${s.id}:${s.updated_at}`).join('|')

  const query = useQuery({
    queryKey: ['calendar-busy', userId, todayStr, sig],
    enabled,
    staleTime: 5 * MINUTE,
    retry: false,
    queryFn: async () => {
      let busyMinutes = 0
      let hadError = false
      for (const s of sources) {
        let text: string | null = s.ics_text
        if (s.kind === 'url' && s.url) {
          try {
            text = await fetchIcs(s.url)
          } catch {
            hadError = true
            text = null
          }
        }
        if (text) busyMinutes += busyMinutesFromIcs(text, todayStr)
      }
      return { busyMinutes: Math.min(MAX_BUSY, busyMinutes), hadError }
    },
  })

  return {
    busyMinutes: enabled ? (query.data?.busyMinutes ?? 0) : 0,
    hadError: enabled ? (query.data?.hadError ?? false) : false,
    enabled,
  }
}
