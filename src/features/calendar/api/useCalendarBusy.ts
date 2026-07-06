import { useQuery } from '@tanstack/react-query'
import { FEATURES } from '@/lib/config'
import { useAuth } from '@/features/auth/auth-context'
import { busyMinutesFromIcs } from '../ics'
import { useCalendarSources } from './useCalendarSources'

const MINUTE = 60_000
const MAX_BUSY = 24 * 60

/**
 * Hard ceiling on a fetched .ics body. Larger than the 1 MB file-upload cap
 * (CalendarSettings.MAX_ICS_BYTES) because legitimate multi-year subscribed feeds
 * (Google/Outlook) routinely exceed 1 MB — but still bounded so a hostile or
 * misconfigured endpoint can't stream an unbounded body into tab memory.
 */
export const MAX_URL_ICS_BYTES = 8_000_000
/** Abort a stalled/tar-pit ICS host so the busy query can't hang forever. */
export const ICS_FETCH_TIMEOUT_MS = 15_000

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

/**
 * Fetch a user-supplied .ics URL defensively: it is UNTRUSTED input fetched from
 * the browser, so we (1) time out a stalled host, (2) honor the React Query abort
 * signal so unmounts don't leak the request, and (3) stream the body with a hard
 * byte cap so an oversized/unbounded response can't freeze or OOM the tab. Any
 * violation throws into the caller's catch, which just marks the source hadError.
 * Exported for unit testing. Never trusts Content-Length alone (absent on chunked).
 */
export async function fetchIcs(url: string, outerSignal?: AbortSignal): Promise<string> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort()
    else outerSignal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => controller.abort(), ICS_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(normalizeIcsUrl(url), { redirect: 'follow', signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    // Fast-reject an oversized body when the server declares its length.
    const declared = Number(res.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_URL_ICS_BYTES) {
      throw new Error('ICS response too large')
    }

    // Stream with a running byte cap — the load-bearing guard (chunked responses
    // carry no Content-Length). Fall back to text() only if streaming is absent.
    if (!res.body) return await res.text()
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    let bytes = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_URL_ICS_BYTES) {
        await reader.cancel()
        throw new Error('ICS response too large')
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    clearTimeout(timer)
    if (outerSignal) outerSignal.removeEventListener('abort', onAbort)
  }
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
    queryFn: async ({ signal }) => {
      let busyMinutes = 0
      let hadError = false
      for (const s of sources) {
        let text: string | null = s.ics_text
        if (s.kind === 'url' && s.url) {
          try {
            text = await fetchIcs(s.url, signal)
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
