import { supabase } from '@/lib/supabase'

/**
 * Client side of the /api/calendar-fetch proxy.
 *
 * Subscribed (kind 'url') calendars are fetched SERVER-side, because Google /
 * Outlook / Apple do not send CORS headers on their .ics endpoints — the old
 * in-browser fetch was blocked for essentially every real provider.
 *
 * Note there is no URL parameter: the server reads the caller's own
 * `calendar_sources` rows. That is deliberate (an accepted URL would make the
 * endpoint an open proxy), so this function just needs the session token.
 */

export interface ProxySourceResult {
  id: string
  ics?: string
  error?: string
}

export interface ProxyOutcome {
  /** source id → raw ICS text, for every source that came back cleanly. */
  byId: Map<string, string>
  /** At least one source failed to fetch (network/provider problem). */
  hadError: boolean
  /** The plan does not include live URL sync — NOT an error, just gated. */
  proRequired: boolean
}

const EMPTY: ProxyOutcome = { byId: new Map(), hadError: false, proRequired: false }

/**
 * Fetch every subscribed calendar for the signed-in user. Never throws — a
 * calendar problem must never break the capacity meter, so every failure mode
 * degrades to "no busy minutes from URL sources".
 */
export async function fetchUrlCalendars(signal?: AbortSignal): Promise<ProxyOutcome> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return EMPTY

  let res: Response
  try {
    res = await fetch('/api/calendar-fetch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: '{}',
      signal,
    })
  } catch {
    return { byId: new Map(), hadError: true, proRequired: false }
  }

  if (res.status === 403) {
    // Gated, not broken — the UI shows an upsell, not a scary error.
    return { byId: new Map(), hadError: false, proRequired: true }
  }
  if (!res.ok) return { byId: new Map(), hadError: true, proRequired: false }

  const body = (await res.json().catch(() => null)) as { sources?: ProxySourceResult[] } | null
  const list = body?.sources ?? []
  const byId = new Map<string, string>()
  let hadError = false
  for (const s of list) {
    if (typeof s.ics === 'string' && s.ics.length > 0) byId.set(s.id, s.ics)
    else hadError = true
  }
  return { byId, hadError, proRequired: false }
}
