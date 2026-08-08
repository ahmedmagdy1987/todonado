import { describe, expect, it, vi } from 'vitest'
import {
  AGGREGATE_DEADLINE_MS,
  DB_QUERY_LIMIT,
  MAX_CONCURRENT_FETCHES,
  MAX_EVENTS_PER_REQUEST,
  MAX_SOURCES_PER_REQUEST,
  MAX_URL_LENGTH,
  PER_SOURCE_TIMEOUT_MS,
  calendarUrlKey,
  countVevents,
  mapWithConcurrency,
} from './calendarLimits.js'

/**
 * The primitives behind the calendar abuse controls (issue #9).
 *
 * `/api/calendar-fetch` selected EVERY url source with no `.limit()` and looped
 * over all of them. The only ceiling was a BYTE budget, and a source that 404s
 * or times out consumes none of it — so an authenticated Pro account could turn
 * one POST into unbounded outbound fan-out from Vercel's egress.
 *
 * These test the pieces in isolation; calendar-fetch.test.ts tests the handler
 * that composes them.
 */

describe('the limits themselves', () => {
  it('caps the QUERY at one more row than it will fetch', () => {
    // The extra row is how "more exist" is detected without fetching it.
    expect(DB_QUERY_LIMIT).toBe(MAX_SOURCES_PER_REQUEST + 1)
    expect(MAX_SOURCES_PER_REQUEST).toBe(10)
  })

  it('bounds concurrency, per-source time and the whole invocation', () => {
    expect(MAX_CONCURRENT_FETCHES).toBe(3)
    expect(PER_SOURCE_TIMEOUT_MS).toBe(10_000)
    expect(AGGREGATE_DEADLINE_MS).toBe(20_000)
    /*
     * The aggregate MUST be able to cut a per-source timeout short, or one
     * hostile slow source would still be able to run past it.
     */
    expect(AGGREGATE_DEADLINE_MS).toBeLessThan(PER_SOURCE_TIMEOUT_MS * MAX_SOURCES_PER_REQUEST)
  })

  it('mirrors the database URL length cap in code', () => {
    // 20260801120000_length_caps.sql: char_length(url) <= 2048. Enforced here
    // too so it holds against a row that predates the constraint.
    expect(MAX_URL_LENGTH).toBe(2_048)
  })
})

describe('calendarUrlKey — conservative deduplication', () => {
  it('treats identical URLs as one', () => {
    const a = calendarUrlKey('https://cal.example.com/feed.ics?token=abc')
    expect(a).not.toBeNull()
    expect(calendarUrlKey('https://cal.example.com/feed.ics?token=abc')).toBe(a)
  })

  it('ignores the fragment, which is never sent to a server', () => {
    expect(calendarUrlKey('https://h.example/f.ics#top')).toBe(calendarUrlKey('https://h.example/f.ics'))
  })

  it('ignores a redundant default port, and only the default one', () => {
    expect(calendarUrlKey('https://h.example:443/f.ics')).toBe(calendarUrlKey('https://h.example/f.ics'))
    expect(calendarUrlKey('http://h.example:80/f.ics')).toBe(calendarUrlKey('http://h.example/f.ics'))
    // A non-default port is meaningful and must NOT collapse.
    expect(calendarUrlKey('https://h.example:8443/f.ics')).not.toBe(
      calendarUrlKey('https://h.example/f.ics'),
    )
  })

  it('lower-cases the host, because DNS is case-insensitive', () => {
    expect(calendarUrlKey('https://CAL.Example.COM/f.ics')).toBe(
      calendarUrlKey('https://cal.example.com/f.ics'),
    )
  })

  /*
   * REGRESSION — webcal:// rows were silently never fetched.
   *
   * A null key makes calendar-fetch.ts report `invalid_source` and SKIP the row
   * before any network work, so it never reached `fetchIcsGuarded` — the only
   * place `normalizeCalendarUrl` runs. The settings UI has always accepted
   * `webcal://`, and it is what Apple and Google hand out, so a user could
   * subscribe, be told "meetings will refresh automatically", and have nothing
   * ever refresh.
   */
  it('accepts webcal:// instead of discarding the row as unfetchable', () => {
    expect(calendarUrlKey('webcal://p01.calendar.icloud.com/published/2/abc')).not.toBeNull()
  })

  it('treats webcal:// and https:// as the SAME feed, so it is fetched once', () => {
    expect(calendarUrlKey('webcal://h.example/f.ics')).toBe(calendarUrlKey('https://h.example/f.ics'))
    expect(calendarUrlKey('WEBCAL://h.example/f.ics')).toBe(calendarUrlKey('https://h.example/f.ics'))
  })

  it('still refuses every OTHER non-web scheme', () => {
    // The fix normalises exactly one scheme; it does not open the gate.
    for (const raw of [
      'ftp://h.example/f.ics',
      'file:///etc/passwd',
      'data:text/calendar,BEGIN:VCALENDAR',
      'javascript://h.example/%0aalert(1)',
      'gopher://h.example/f',
    ]) {
      expect(calendarUrlKey(raw), `${raw} must stay unfetchable`).toBeNull()
    }
  })

  it('applies the port and credential rules to a webcal URL too', () => {
    // Normalisation must not become a way to smuggle something past the rest.
    expect(calendarUrlKey('webcal://u:p@h.example/f.ics')).not.toBe(
      calendarUrlKey('https://h.example/f.ics'),
    )
    expect(calendarUrlKey('webcal://h.example:8443/f.ics')).not.toBe(
      calendarUrlKey('https://h.example/f.ics'),
    )
  })

  it('NEVER collapses URLs that could return different content', () => {
    /*
     * The dangerous direction. Over-eager dedup silently drops a real calendar,
     * so everything that can change the response must distinguish.
     */
    const base = calendarUrlKey('https://h.example/a.ics?x=1')
    for (const other of [
      'https://h.example/b.ics?x=1', // different path
      'https://h.example/a.ics?x=2', // different query value
      'https://h.example/a.ics?y=1', // different query key
      'https://h.example/a.ics?x=1&y=2', // extra parameter
      'https://h.example/a.ics', // no query
      'http://h.example/a.ics?x=1', // different protocol
      'https://other.example/a.ics?x=1', // different host
      'https://h.example:8443/a.ics?x=1', // different port
      'https://u:p@h.example/a.ics?x=1', // credentials present
    ]) {
      expect(calendarUrlKey(other), `${other} must not dedupe against the base`).not.toBe(base)
    }
  })

  it('preserves query parameter ORDER, which a provider may treat as meaningful', () => {
    expect(calendarUrlKey('https://h.example/f.ics?a=1&b=2')).not.toBe(
      calendarUrlKey('https://h.example/f.ics?b=2&a=1'),
    )
  })

  it('rejects a URL longer than the cap, without throwing', () => {
    const long = `https://h.example/${'a'.repeat(MAX_URL_LENGTH)}.ics`
    expect(long.length).toBeGreaterThan(MAX_URL_LENGTH)
    expect(calendarUrlKey(long)).toBeNull()
  })

  it('rejects unusable input rather than grouping it under one key', () => {
    for (const bad of ['', '   ', 'not a url', 'ftp://h.example/f.ics', 'file:///etc/passwd', 'javascript:alert(1)']) {
      expect(calendarUrlKey(bad), `${bad}`).toBeNull()
    }
    expect(calendarUrlKey(undefined as unknown as string)).toBeNull()
  })
})

describe('countVevents', () => {
  const feed = (n: number) =>
    `BEGIN:VCALENDAR\r\n${'BEGIN:VEVENT\r\nSUMMARY:x\r\nEND:VEVENT\r\n'.repeat(n)}END:VCALENDAR`

  it('counts VEVENT blocks', () => {
    expect(countVevents(feed(0))).toBe(0)
    expect(countVevents(feed(1))).toBe(1)
    expect(countVevents(feed(37))).toBe(37)
  })

  it('is case-insensitive, because RFC 5545 property names are', () => {
    expect(countVevents('Begin:vEvent\r\nEND:VEVENT')).toBe(1)
  })

  it('does not allocate an array proportional to the match count', () => {
    /*
     * `split`/`match` would build a 200k-element array on a hostile feed, which
     * would make COUNTING events its own memory-exhaustion vector. This just
     * has to return the right number without falling over.
     */
    expect(countVevents(feed(200_000))).toBe(200_000)
  })

  it('the cap is above any realistic calendar', () => {
    expect(MAX_EVENTS_PER_REQUEST).toBe(5_000)
  })
})

describe('mapWithConcurrency', () => {
  it('never runs more than the limit at once', async () => {
    let inFlight = 0
    let peak = 0
    const items = Array.from({ length: 20 }, (_, i) => i)

    await mapWithConcurrency(items, MAX_CONCURRENT_FETCHES, async (n) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight -= 1
      return n
    })

    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_FETCHES)
    expect(peak).toBe(MAX_CONCURRENT_FETCHES) // and it does use the budget
  })

  it('returns results at their ORIGINAL index regardless of completion order', async () => {
    // Completion order must never reorder the response.
    const out = await mapWithConcurrency([50, 1, 25], 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms))
      return `${i}:${ms}`
    })
    expect(out).toEqual(['0:50', '1:1', '2:25'])
  })

  it('one slow item does not stop the others from starting', async () => {
    /*
     * The property batching would break: with chunked batches, a slow member
     * idles its whole batch. A shared cursor keeps the other runners fed.
     */
    const started: number[] = []
    await mapWithConcurrency([200, 1, 1, 1, 1], 2, async (ms, i) => {
      started.push(i)
      await new Promise((r) => setTimeout(r, ms))
      return i
    })
    // Everything started even though item 0 was 200x slower.
    expect(started.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
  })

  it('handles an empty list and a limit above the item count', async () => {
    expect(await mapWithConcurrency([], 3, async () => 'x')).toEqual([])
    expect(await mapWithConcurrency([1, 2], 99, async (n) => n * 2)).toEqual([2, 4])
  })

  it('is not Promise.all over everything', async () => {
    // The regression that matters: 40 items, limit 3, must never be 40 at once.
    let peak = 0
    let now = 0
    await mapWithConcurrency(Array.from({ length: 40 }, (_, i) => i), 3, async () => {
      now += 1
      peak = Math.max(peak, now)
      await Promise.resolve()
      now -= 1
      return null
    })
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('processes every item exactly once', async () => {
    const seen = vi.fn()
    await mapWithConcurrency(Array.from({ length: 17 }, (_, i) => i), 3, async (n) => {
      seen(n)
      return n
    })
    expect(seen).toHaveBeenCalledTimes(17)
    expect(new Set(seen.mock.calls.map((c) => c[0])).size).toBe(17)
  })
})
