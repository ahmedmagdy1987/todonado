import { describe, expect, it, vi } from 'vitest'
import {
  MAX_REDIRECTS,
  SsrfError,
  assertPublicHost,
  fetchIcsGuarded,
  isPrivateIp,
  normalizeCalendarUrl,
  parseCalendarUrl,
} from './ssrf.js'

/**
 * SSRF guard for the calendar proxy. This is the security boundary: the proxy
 * fetches a URL the USER chose, from inside our infrastructure.
 *
 * Also carries the byte-cap / timeout / non-OK coverage that used to live in
 * src/features/calendar/api/fetchIcs.test.ts — that browser-side fetch was
 * replaced by this server-side one, so the tests moved with the code.
 */

const enc = new TextEncoder()

function streamResponse(chunks: Uint8Array[], headers: Record<string, string> = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers })
}

/** Resolver stub: every host resolves to the given addresses. */
const resolvesTo = (...addresses: string[]) => async () => addresses.map((address) => ({ address }))
const PUBLIC = resolvesTo('93.184.216.34')

describe('normalizeCalendarUrl', () => {
  it('rewrites webcal:// to https:// and trims', () => {
    expect(normalizeCalendarUrl('  webcal://cal.example/f.ics ')).toBe('https://cal.example/f.ics')
    expect(normalizeCalendarUrl('WEBCAL://cal.example/f.ics')).toBe('https://cal.example/f.ics')
  })
})

describe('parseCalendarUrl — static validation', () => {
  it('accepts http, https and webcal on default ports', () => {
    for (const u of [
      'https://cal.example/f.ics',
      'http://cal.example/f.ics',
      'webcal://cal.example/f.ics',
      'https://cal.example:443/f.ics',
      'http://cal.example:80/f.ics',
    ]) {
      expect(parseCalendarUrl(u), u).toHaveProperty('url')
    }
  })

  it.each([
    ['file:///etc/passwd', 'bad_scheme'],
    ['ftp://cal.example/f.ics', 'bad_scheme'],
    ['gopher://cal.example/f', 'bad_scheme'],
    ['data:text/calendar,BEGIN:VEVENT', 'bad_scheme'],
    ['javascript:alert(1)', 'bad_scheme'],
    ['not a url', 'invalid_url'],
    ['', 'invalid_url'],
    // Odd ports are how an SSRF becomes an internal port scanner.
    ['https://cal.example:22/f.ics', 'bad_port'],
    ['https://cal.example:6379/f.ics', 'bad_port'],
    ['http://cal.example:8080/f.ics', 'bad_port'],
    // Credentials could be replayed against an internal service.
    ['https://user:pass@cal.example/f.ics', 'has_credentials'],
  ])('rejects %s as %s', (input, code) => {
    expect(parseCalendarUrl(input)).toEqual({ reject: code })
  })
})

describe('isPrivateIp', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.1.2.3', 'loopback range'],
    ['10.0.0.5', 'private A'],
    ['172.16.0.1', 'private B lower'],
    ['172.31.255.254', 'private B upper'],
    ['192.168.1.1', 'private C'],
    ['169.254.169.254', 'CLOUD METADATA'],
    ['169.254.0.1', 'link-local'],
    ['100.64.0.1', 'CGNAT'],
    ['0.0.0.0', 'unspecified'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['198.18.0.1', 'benchmarking'],
    ['192.0.2.1', 'TEST-NET-1'],
    ['::1', 'IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fc00::1', 'IPv6 unique-local'],
    ['fd12:3456::1', 'IPv6 unique-local'],
    ['fe80::1', 'IPv6 link-local'],
    ['ff02::1', 'IPv6 multicast'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
    ['garbage', 'unparseable fails closed'],
    ['', 'empty fails closed'],
  ])('blocks %s (%s)', (ip) => {
    expect(isPrivateIp(ip)).toBe(true)
  })

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.15.0.1', // just below the private B block
    '172.32.0.1', // just above it
    '100.63.0.1', // just below CGNAT
    '100.128.0.1', // just above CGNAT
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
  ])('allows public address %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(false)
  })
})

describe('assertPublicHost', () => {
  it('passes when every resolved address is public', async () => {
    await expect(assertPublicHost('cal.example', resolvesTo('8.8.8.8', '1.1.1.1'))).resolves.toEqual(
      ['8.8.8.8', '1.1.1.1'],
    )
  })

  it('rejects a hostname pointed at a private address (DNS-level attack)', async () => {
    await expect(assertPublicHost('evil.example', resolvesTo('127.0.0.1'))).rejects.toMatchObject({
      code: 'private_host',
    })
  })

  it('rejects when ANY address is private, even if others are public', async () => {
    await expect(
      assertPublicHost('mixed.example', resolvesTo('8.8.8.8', '169.254.169.254')),
    ).rejects.toMatchObject({ code: 'private_host' })
  })

  it('fails closed when DNS throws or returns nothing', async () => {
    const boom = async () => {
      throw new Error('ENOTFOUND')
    }
    await expect(assertPublicHost('nope.example', boom)).rejects.toMatchObject({
      code: 'dns_failed',
    })
    await expect(assertPublicHost('nope.example', resolvesTo())).rejects.toMatchObject({
      code: 'dns_failed',
    })
  })
})

describe('fetchIcsGuarded', () => {
  it('returns the body for a well-behaved public feed', async () => {
    const fetchImpl = vi.fn(async () => streamResponse([enc.encode('BEGIN:VEVENT\nEND:VEVENT')]))
    await expect(
      fetchIcsGuarded('https://cal.example/f.ics', { fetchImpl, resolver: PUBLIC }),
    ).resolves.toContain('BEGIN:VEVENT')
  })

  it('NEVER opens a socket to a private host — rejected before fetch', async () => {
    const fetchImpl = vi.fn()
    await expect(
      fetchIcsGuarded('https://internal.example/f.ics', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolver: resolvesTo('10.0.0.1'),
      }),
    ).rejects.toMatchObject({ code: 'private_host' })
    expect(fetchImpl, 'fetch must not be called for a private host').not.toHaveBeenCalled()
  })

  it('re-validates redirects — a public host cannot bounce us to the metadata IP', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        }),
    )
    await expect(
      fetchIcsGuarded('https://cal.example/f.ics', {
        fetchImpl,
        // First hop public, the redirect target resolves to metadata.
        resolver: async (host) =>
          host === 'cal.example' ? [{ address: '8.8.8.8' }] : [{ address: '169.254.169.254' }],
      }),
    ).rejects.toMatchObject({ code: 'private_host' })
  })

  it('follows a legitimate redirect to a public host', async () => {
    let hop = 0
    const fetchImpl = vi.fn(async () => {
      hop += 1
      return hop === 1
        ? new Response(null, { status: 301, headers: { location: 'https://cdn.example/f.ics' } })
        : streamResponse([enc.encode('BEGIN:VEVENT')])
    })
    await expect(
      fetchIcsGuarded('https://cal.example/f.ics', { fetchImpl, resolver: PUBLIC }),
    ).resolves.toContain('BEGIN:VEVENT')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('stops after too many redirects', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: 'https://cal.example/loop.ics' } }),
    )
    await expect(
      fetchIcsGuarded('https://cal.example/f.ics', { fetchImpl, resolver: PUBLIC }),
    ).rejects.toMatchObject({ code: 'too_many_redirects' })
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_REDIRECTS + 1)
  })

  it('rejects an oversized body declared by content-length', async () => {
    const fetchImpl = vi.fn(async () =>
      streamResponse([enc.encode('x')], { 'content-length': '999999' }),
    )
    await expect(
      fetchIcsGuarded('https://cal.example/huge.ics', {
        fetchImpl,
        resolver: PUBLIC,
        maxBytes: 1000,
      }),
    ).rejects.toMatchObject({ code: 'response_too_large' })
  })

  it('rejects an oversized CHUNKED body (no content-length) mid-stream', async () => {
    const oneK = enc.encode('x'.repeat(1000))
    const fetchImpl = vi.fn(async () => streamResponse([oneK, oneK, oneK]))
    await expect(
      fetchIcsGuarded('https://cal.example/tarpit.ics', {
        fetchImpl,
        resolver: PUBLIC,
        maxBytes: 1500,
      }),
    ).rejects.toMatchObject({ code: 'response_too_large' })
  })

  it('maps a non-OK upstream status to fetch_failed', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }))
    await expect(
      fetchIcsGuarded('https://cal.example/500.ics', { fetchImpl, resolver: PUBLIC }),
    ).rejects.toMatchObject({ code: 'fetch_failed' })
  })

  it('sends no credentials and follows redirects manually', async () => {
    const inits: RequestInit[] = []
    const fetchImpl = (async (...args: [URL | string, RequestInit?]) => {
      if (args[1]) inits.push(args[1])
      return streamResponse([enc.encode('BEGIN:VEVENT')])
    }) as unknown as typeof fetch

    await fetchIcsGuarded('https://cal.example/f.ics', { fetchImpl, resolver: PUBLIC })

    const init = inits[0]
    expect(init.credentials, 'no ambient cookies/auth may be sent').toBe('omit')
    expect(init.redirect, 'redirects must be validated by us, not followed by fetch').toBe('manual')
    expect(init.headers).not.toHaveProperty('cookie')
    expect(init.headers).not.toHaveProperty('authorization')
  })

  it('aborts a stalled host rather than hanging forever', async () => {
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    await expect(
      fetchIcsGuarded('https://cal.example/slow.ics', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolver: PUBLIC,
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ code: 'fetch_failed' })
  })

  it('throws SsrfError instances so callers can map codes safely', async () => {
    const fetchImpl = vi.fn()
    await expect(
      fetchIcsGuarded('file:///etc/passwd', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolver: PUBLIC,
      }),
    ).rejects.toBeInstanceOf(SsrfError)
  })
})

describe('fetchIcsGuarded — ONE budget for the whole request (audit FLAG-15)', () => {
  const resolver = async () => [{ address: '93.184.216.34' }]

  /** A 302 to `to`, with an optional body to prove it gets drained. */
  function redirectTo(to: string, body?: ReadableStream) {
    return new Response(body ?? null, { status: 302, headers: { location: to } })
  }

  it('the timeout is a whole-request deadline, not one per hop', async () => {
    /*
     * Each hop is FAST enough to pass a per-hop budget but slow enough that the
     * chain blows a whole-request one. That is what separates the two designs:
     *
     *   per-hop      each of 4 hops gets its own 100ms, all succeed, the loop
     *                runs to completion and ends in `too_many_redirects`
     *   whole-request  the shared deadline expires mid-chain and it stops
     *
     * An earlier version made every hop STALL past the budget, which aborts on
     * hop one under both designs — it passed either way and proved nothing.
     */
    let hops = 0
    const fetchImpl = vi.fn(async () => {
      hops += 1
      await new Promise((r) => setTimeout(r, 40))
      return new Response(null, {
        status: 302,
        headers: { location: `https://example.com/hop${hops}` },
      })
    }) as unknown as typeof fetch

    const started = Date.now()
    await expect(
      fetchIcsGuarded('https://example.com/a.ics', { fetchImpl, resolver, timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: 'fetch_failed' }) // NOT too_many_redirects

    expect(hops, 'the chain must stop when the shared budget runs out').toBeLessThan(
      MAX_REDIRECTS + 1,
    )
    expect(Date.now() - started).toBeLessThan(160)
  })

  it('refuses to start another hop once the deadline has passed', async () => {
    const fetchImpl = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 40))
      return redirectTo('https://example.com/next')
    }) as unknown as typeof fetch

    await expect(
      fetchIcsGuarded('https://example.com/a.ics', { fetchImpl, resolver, timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(SsrfError)

    // It must give up mid-chain rather than running the full MAX_REDIRECTS.
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeLessThan(
      MAX_REDIRECTS + 1,
    )
  })

  it('DRAINS a redirect body instead of abandoning the stream', async () => {
    let cancelled = false
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('x'.repeat(1000)))
      },
      cancel() {
        cancelled = true
      },
    })
    let hop = 0
    const fetchImpl = vi.fn(async () => {
      hop += 1
      if (hop === 1) return redirectTo('https://example.com/final.ics', body)
      return new Response('BEGIN:VCALENDAR\nEND:VCALENDAR')
    }) as unknown as typeof fetch

    const out = await fetchIcsGuarded('https://example.com/a.ics', { fetchImpl, resolver })

    expect(out).toContain('BEGIN:VCALENDAR')
    expect(cancelled, 'an unread redirect body holds its socket open').toBe(true)
  })

  it('measures the cap in BYTES, not UTF-16 code units', async () => {
    /*
     * A body of multi-byte characters is larger on the wire than
     * `String.length` suggests. Measuring the string understated it against a
     * cap expressed in bytes, so a feed could exceed the real limit.
     */
    const text = 'é'.repeat(100) // 100 UTF-16 code units, 200 UTF-8 bytes

    /*
     * This must be a response with NO body stream, because that is the branch
     * that measured `text.length`. `new Response(text)` HAS a body and goes
     * through the streaming path, which already counted bytes correctly — the
     * first version of this test did exactly that and therefore proved nothing.
     */
    const bodyless = {
      ok: true,
      status: 200,
      headers: new Headers(),
      body: null,
      text: async () => text,
    }
    const fetchImpl = vi.fn(async () => bodyless) as unknown as typeof fetch

    await expect(
      fetchIcsGuarded('https://example.com/a.ics', { fetchImpl, resolver, maxBytes: 150 }),
    ).rejects.toMatchObject({ code: 'response_too_large' })
  })

  it('still returns a body that fits the budget', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('BEGIN:VCALENDAR\nEND:VCALENDAR'),
    ) as unknown as typeof fetch

    await expect(
      fetchIcsGuarded('https://example.com/a.ics', { fetchImpl, resolver, maxBytes: 1000 }),
    ).resolves.toContain('VCALENDAR')
  })
})
