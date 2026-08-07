import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  MAX_REDIRECTS,
  SsrfError,
  assertPublicHost,
  fetchIcsGuarded,
  isPrivateIp,
  normalizeCalendarUrl,
  parseCalendarUrl,
  pinnedLookup,
  type RequestImpl,
  type Resolver,
  type SsrfClientRequest,
  type SsrfIncomingMessage,
  type SsrfRequestOptions,
} from './ssrf.js'

/**
 * SSRF guard for the calendar proxy. This is the security boundary: the proxy
 * fetches a URL the USER chose, from inside our infrastructure.
 *
 * Also carries the byte-cap / timeout / non-OK coverage that used to live in
 * src/features/calendar/api/fetchIcs.test.ts — that browser-side fetch was
 * replaced by this server-side one, so the tests moved with the code.
 *
 * ── WHY THE SEAM MOVED FROM `fetchImpl` TO `requestImpl` (issue #10) ────────
 *
 * These tests used to inject a fake `fetch`. That seam COULD NOT SEE THE BUG it
 * was supposed to guard: a `fetch` stub is handed a URL, resolves nothing, and
 * has no lookup hook — so a pinned connection and a rebindable one look
 * identical from inside it. Every one of the old tests would have passed
 * against the vulnerable code, and did.
 *
 * The seam is now `http.request`-shaped, which means the fake receives the very
 * options object the socket layer would — `lookup` included. `harness()` CALLS
 * that hook the way `net.connect` does and records the address it answers with,
 * so "which address would this actually have dialled" becomes an assertion
 * rather than an assumption.
 */

const enc = new TextEncoder()

/** What a single hop's fake response should be. */
interface HopSpec {
  status?: number
  headers?: Record<string, string | string[] | undefined>
  chunks?: Uint8Array[]
  body?: string
  /** Never answer at all — proves the deadline, not the transport, ends it. */
  stall?: boolean
  /** Answer after this long, to spend the shared budget. */
  delayMs?: number
  /** Fail the transport instead of answering. */
  error?: Error
}

function makeResponse(spec: HopSpec): SsrfIncomingMessage {
  const chunks = spec.chunks ?? [enc.encode(spec.body ?? '')]
  const stream = Readable.from(chunks) as Readable & {
    statusCode?: number
    headers: Record<string, string | string[] | undefined>
  }
  stream.statusCode = spec.status ?? 200
  stream.headers = spec.headers ?? {}
  return stream as unknown as SsrfIncomingMessage
}

/**
 * A request-level fake that behaves like `http.request` — and, crucially,
 * EXERCISES THE PINNED LOOKUP exactly as the socket layer would, recording the
 * address the connection would really have been opened to.
 */
function harness(plan: HopSpec[] | ((hop: number) => HopSpec)) {
  const hops: SsrfRequestOptions[] = []
  /** The address `lookup` answered with, per hop, in order. */
  const connectedTo: string[] = []
  /** The hostname the socket layer asked about, per hop. */
  const askedFor: string[] = []
  const responses: SsrfIncomingMessage[] = []
  let n = 0

  const impl: RequestImpl = (options, onResponse) => {
    n += 1
    const hop = n
    hops.push(options)

    // This is the whole point of the seam: run the hook the way net.connect
    // would, and remember what it said.
    askedFor.push(options.hostname)
    options.lookup(options.hostname, { family: 0 }, (err, address) => {
      if (!err && typeof address === 'string') connectedTo.push(address)
    })

    const req = new EventEmitter() as EventEmitter & SsrfClientRequest
    let destroyed = false
    req.end = () => req
    req.destroy = (error?: Error) => {
      if (destroyed) return req
      destroyed = true
      req.emit('error', error ?? new Error('destroyed'))
      return req
    }

    const spec = typeof plan === 'function' ? plan(hop) : (plan[hop - 1] ?? plan[plan.length - 1])
    if (!spec.stall) {
      const answer = () => {
        if (destroyed) return
        if (spec.error) {
          req.emit('error', spec.error)
          return
        }
        const res = makeResponse(spec)
        responses.push(res)
        onResponse(res)
      }
      if (spec.delayMs) setTimeout(answer, spec.delayMs)
      else setImmediate(answer)
    }
    return req
  }

  return { impl, hops, connectedTo, askedFor, responses, callCount: () => n }
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

describe('pinnedLookup — the hook that closes the TOCTOU', () => {
  it('answers with the pinned address and never consults DNS', () => {
    const seen: unknown[] = []
    pinnedLookup('93.184.216.34')('anything.example', {}, (err, address, family) => {
      seen.push(err, address, family)
    })
    expect(seen).toEqual([null, '93.184.216.34', 4])
  })

  it('answers the { all: true } shape with an array', () => {
    let out: unknown
    pinnedLookup('2606:4700:4700::1111')('anything.example', { all: true }, (_e, addresses) => {
      out = addresses
    })
    expect(out).toEqual([{ address: '2606:4700:4700::1111', family: 6 }])
  })

  it('reports the right family for v4 and v6', () => {
    const familyOf = (ip: string) => {
      let f: number | undefined
      pinnedLookup(ip)('h', {}, (_e, _a, family) => {
        f = family
      })
      return f
    }
    expect(familyOf('8.8.8.8')).toBe(4)
    expect(familyOf('2001:4860:4860::8888')).toBe(6)
  })
})

describe('fetchIcsGuarded — DNS REBINDING / connection pinning (issue #10)', () => {
  it('CONNECTS TO THE VALIDATED ADDRESS, not a re-resolved one', async () => {
    /*
     * THE REGRESSION TEST FOR THIS WHOLE CHANGE.
     *
     * The resolver answers public FIRST and loopback on every call after — the
     * exact rebinding attack. Under the old code the validated address was
     * discarded and the hostname was handed to `fetch`, which resolved it again
     * and got 127.0.0.1. Here the socket can only ever be opened to an address
     * that already passed `isPrivateIp`.
     */
    let calls = 0
    const rebinding: Resolver = async () => {
      calls += 1
      return calls === 1 ? [{ address: '93.184.216.34' }] : [{ address: '127.0.0.1' }]
    }
    const h = harness([{ body: 'BEGIN:VEVENT' }])

    await expect(
      fetchIcsGuarded('https://rebind.example/f.ics', { requestImpl: h.impl, resolver: rebinding }),
    ).resolves.toContain('BEGIN:VEVENT')

    expect(h.connectedTo, 'the socket must use the address that was checked').toEqual([
      '93.184.216.34',
    ])
    expect(h.connectedTo).not.toContain('127.0.0.1')
  })

  it('keeps the ORIGINAL hostname for Host, SNI and certificate validation', async () => {
    const h = harness([{ body: 'BEGIN:VEVENT' }])
    await fetchIcsGuarded('https://cal.example/f.ics', { requestImpl: h.impl, resolver: PUBLIC })

    const opts = h.hops[0]
    // The name — not the pinned IP — is what the certificate is checked against.
    expect(opts.hostname).toBe('cal.example')
    expect(opts.servername).toBe('cal.example')
    expect(opts.rejectUnauthorized, 'TLS verification must stay on').toBe(true)
    // ...while the ADDRESS the socket dials is the validated literal.
    expect(h.askedFor).toEqual(['cal.example'])
    expect(h.connectedTo).toEqual(['93.184.216.34'])
  })

  it('omits SNI when the host is a literal IP (SNI forbids one)', async () => {
    const h = harness([{ body: 'BEGIN:VEVENT' }])
    await fetchIcsGuarded('https://93.184.216.34/f.ics', {
      requestImpl: h.impl,
      resolver: PUBLIC,
    })
    expect(h.hops[0].servername).toBeUndefined()
    expect(h.hops[0].rejectUnauthorized).toBe(true)
  })

  it('RE-PINS on every redirect hop, against a fresh validation', async () => {
    const perHost: Record<string, string> = {
      'cal.example': '93.184.216.34',
      'cdn.example': '8.8.8.8',
    }
    const resolver: Resolver = async (host) => [{ address: perHost[host] ?? '1.1.1.1' }]
    const h = harness((hop) =>
      hop === 1
        ? { status: 301, headers: { location: 'https://cdn.example/f.ics' } }
        : { body: 'BEGIN:VEVENT' },
    )

    await expect(
      fetchIcsGuarded('https://cal.example/f.ics', { requestImpl: h.impl, resolver }),
    ).resolves.toContain('BEGIN:VEVENT')

    expect(h.askedFor).toEqual(['cal.example', 'cdn.example'])
    expect(h.connectedTo, 'each hop dials its own validated address').toEqual([
      '93.184.216.34',
      '8.8.8.8',
    ])
  })

  it('a redirect target that rebinds to loopback never gets a socket', async () => {
    const resolver: Resolver = async (host) =>
      host === 'cal.example' ? [{ address: '8.8.8.8' }] : [{ address: '127.0.0.1' }]
    const h = harness([{ status: 302, headers: { location: 'https://evil.example/f.ics' } }])

    await expect(
      fetchIcsGuarded('https://cal.example/f.ics', { requestImpl: h.impl, resolver }),
    ).rejects.toMatchObject({ code: 'private_host' })

    expect(h.callCount(), 'the second hop must be refused before any request').toBe(1)
  })

  it('uses a FRESH hop-scoped agent, never a shared or global one', async () => {
    const h = harness((hop) =>
      hop === 1
        ? { status: 302, headers: { location: 'https://cdn.example/f.ics' } }
        : { body: 'BEGIN:VEVENT' },
    )
    await fetchIcsGuarded('https://cal.example/f.ics', { requestImpl: h.impl, resolver: PUBLIC })

    const [first, second] = h.hops
    expect(first.agent, 'a reused agent pools a socket pinned for another host').not.toBe(
      second.agent,
    )
    for (const opts of h.hops) {
      expect(
        (opts.agent as unknown as { options: { keepAlive?: boolean } }).options.keepAlive,
        'keepAlive would outlive the pin',
      ).toBe(false)
      expect(
        (opts.agent as unknown as { options: { lookup?: unknown } }).options.lookup,
        'the agent is what actually pins the socket',
      ).toBe(opts.lookup)
    }
  })

  it('DESTROYS the agent deterministically, on success and on failure', async () => {
    const destroys: ReturnType<typeof vi.spyOn>[] = []
    const spyOnAgent = (options: SsrfRequestOptions) => {
      destroys.push(vi.spyOn(options.agent, 'destroy'))
    }

    const ok = harness([{ body: 'BEGIN:VEVENT' }])
    const okImpl: RequestImpl = (options, cb) => {
      spyOnAgent(options)
      return ok.impl(options, cb)
    }
    await fetchIcsGuarded('https://cal.example/f.ics', { requestImpl: okImpl, resolver: PUBLIC })

    const bad = harness([{ status: 500, body: 'nope' }])
    const badImpl: RequestImpl = (options, cb) => {
      spyOnAgent(options)
      return bad.impl(options, cb)
    }
    await expect(
      fetchIcsGuarded('https://cal.example/f.ics', { requestImpl: badImpl, resolver: PUBLIC }),
    ).rejects.toBeInstanceOf(SsrfError)

    expect(destroys).toHaveLength(2)
    for (const spy of destroys) expect(spy).toHaveBeenCalled()
  })

  it('asks for identity encoding so the byte cap counts wire bytes', async () => {
    const h = harness([{ body: 'BEGIN:VEVENT' }])
    await fetchIcsGuarded('https://cal.example/f.ics', { requestImpl: h.impl, resolver: PUBLIC })
    expect(h.hops[0].headers['accept-encoding'], 'gzip would let a bomb past the cap').toBe(
      'identity',
    )
  })
})

describe('fetchIcsGuarded', () => {
  it('returns the body for a well-behaved public feed', async () => {
    const h = harness([{ body: 'BEGIN:VEVENT\nEND:VEVENT' }])
    await expect(
      fetchIcsGuarded('https://cal.example/f.ics', { requestImpl: h.impl, resolver: PUBLIC }),
    ).resolves.toContain('BEGIN:VEVENT')
  })

  it('NEVER opens a socket to a private host — rejected before the request', async () => {
    const h = harness([{ body: 'unreachable' }])
    await expect(
      fetchIcsGuarded('https://internal.example/f.ics', {
        requestImpl: h.impl,
        resolver: resolvesTo('10.0.0.1'),
      }),
    ).rejects.toMatchObject({ code: 'private_host' })
    expect(h.callCount(), 'no request may be made for a private host').toBe(0)
  })

  it('re-validates redirects — a public host cannot bounce us to the metadata IP', async () => {
    const h = harness([
      { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } },
    ])
    await expect(
      fetchIcsGuarded('http://cal.example/f.ics', {
        requestImpl: h.impl,
        // First hop public, the redirect target resolves to metadata.
        resolver: async (host) =>
          host === 'cal.example' ? [{ address: '8.8.8.8' }] : [{ address: '169.254.169.254' }],
      }),
    ).rejects.toMatchObject({ code: 'private_host' })
  })

  it('follows a legitimate redirect to a public host', async () => {
    const h = harness((hop) =>
      hop === 1
        ? { status: 301, headers: { location: 'https://cdn.example/f.ics' } }
        : { body: 'BEGIN:VEVENT' },
    )
    await expect(
      fetchIcsGuarded('https://cal.example/f.ics', { requestImpl: h.impl, resolver: PUBLIC }),
    ).resolves.toContain('BEGIN:VEVENT')
    expect(h.callCount()).toBe(2)
  })

  it('REFUSES an https → http downgrade on redirect', async () => {
    /*
     * Plaintext is not merely readable, it is REWRITABLE in flight — an on-path
     * attacker who can rewrite the next response chooses the final destination
     * regardless of every other check here. A feed that started encrypted stays
     * encrypted.
     */
    const h = harness([{ status: 302, headers: { location: 'http://cal.example/f.ics' } }])
    await expect(
      fetchIcsGuarded('https://cal.example/f.ics', { requestImpl: h.impl, resolver: PUBLIC }),
    ).rejects.toMatchObject({ code: 'bad_scheme' })
    expect(h.callCount(), 'the downgraded hop must never be requested').toBe(1)
  })

  it('still allows http → https on redirect', async () => {
    const h = harness((hop) =>
      hop === 1
        ? { status: 302, headers: { location: 'https://cal.example/f.ics' } }
        : { body: 'BEGIN:VEVENT' },
    )
    await expect(
      fetchIcsGuarded('http://cal.example/f.ics', { requestImpl: h.impl, resolver: PUBLIC }),
    ).resolves.toContain('BEGIN:VEVENT')
  })

  it('stops after too many redirects', async () => {
    const h = harness([{ status: 302, headers: { location: 'https://cal.example/loop.ics' } }])
    await expect(
      fetchIcsGuarded('https://cal.example/f.ics', { requestImpl: h.impl, resolver: PUBLIC }),
    ).rejects.toMatchObject({ code: 'too_many_redirects' })
    expect(h.callCount()).toBe(MAX_REDIRECTS + 1)
  })

  it('rejects a redirect with no location header', async () => {
    const h = harness([{ status: 302 }])
    await expect(
      fetchIcsGuarded('https://cal.example/f.ics', { requestImpl: h.impl, resolver: PUBLIC }),
    ).rejects.toMatchObject({ code: 'fetch_failed' })
  })

  it('rejects an oversized body declared by content-length', async () => {
    const h = harness([{ body: 'x', headers: { 'content-length': '999999' } }])
    await expect(
      fetchIcsGuarded('https://cal.example/huge.ics', {
        requestImpl: h.impl,
        resolver: PUBLIC,
        maxBytes: 1000,
      }),
    ).rejects.toMatchObject({ code: 'response_too_large' })
  })

  it('rejects an oversized CHUNKED body (no content-length) mid-stream', async () => {
    const oneK = enc.encode('x'.repeat(1000))
    const h = harness([{ chunks: [oneK, oneK, oneK] }])
    await expect(
      fetchIcsGuarded('https://cal.example/tarpit.ics', {
        requestImpl: h.impl,
        resolver: PUBLIC,
        maxBytes: 1500,
      }),
    ).rejects.toMatchObject({ code: 'response_too_large' })
  })

  it('maps a non-OK upstream status to fetch_failed', async () => {
    const h = harness([{ status: 500, body: 'nope' }])
    await expect(
      fetchIcsGuarded('https://cal.example/500.ics', { requestImpl: h.impl, resolver: PUBLIC }),
    ).rejects.toMatchObject({ code: 'fetch_failed' })
  })

  it('maps a transport error to fetch_failed without leaking it', async () => {
    const h = harness([{ error: new Error('ECONNREFUSED 10.1.2.3:443') }])
    const err = await fetchIcsGuarded('https://cal.example/f.ics', {
      requestImpl: h.impl,
      resolver: PUBLIC,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SsrfError)
    expect((err as SsrfError).code).toBe('fetch_failed')
    expect(
      (err as SsrfError).message,
      'an upstream message could name an internal address',
    ).not.toContain('10.1.2.3')
  })

  it('sends no ambient credentials and follows redirects manually', async () => {
    const h = harness([{ body: 'BEGIN:VEVENT' }])
    await fetchIcsGuarded('https://cal.example/f.ics', { requestImpl: h.impl, resolver: PUBLIC })

    const { headers } = h.hops[0]
    expect(headers).not.toHaveProperty('cookie')
    expect(headers).not.toHaveProperty('authorization')
    expect(h.hops[0].method).toBe('GET')
    // Manual by construction: nothing here asks the transport to follow, and
    // the redirect tests above prove each hop is re-entered through the guard.
  })

  it('aborts a stalled host rather than hanging forever', async () => {
    const h = harness([{ stall: true }])
    await expect(
      fetchIcsGuarded('https://cal.example/slow.ics', {
        requestImpl: h.impl,
        resolver: PUBLIC,
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ code: 'fetch_failed' })
  })

  it('throws SsrfError instances so callers can map codes safely', async () => {
    const h = harness([{ body: 'unreachable' }])
    await expect(
      fetchIcsGuarded('file:///etc/passwd', { requestImpl: h.impl, resolver: PUBLIC }),
    ).rejects.toBeInstanceOf(SsrfError)
    expect(h.callCount()).toBe(0)
  })
})

describe('fetchIcsGuarded — ONE budget for the whole request (audit FLAG-15)', () => {
  const resolver: Resolver = async () => [{ address: '93.184.216.34' }]

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
    const h = harness((hop) => ({
      status: 302,
      headers: { location: `https://example.com/hop${hop}` },
      delayMs: 40,
    }))

    const started = Date.now()
    await expect(
      fetchIcsGuarded('https://example.com/a.ics', {
        requestImpl: h.impl,
        resolver,
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({ code: 'fetch_failed' }) // NOT too_many_redirects

    expect(h.callCount(), 'the chain must stop when the shared budget runs out').toBeLessThan(
      MAX_REDIRECTS + 1,
    )
    expect(Date.now() - started).toBeLessThan(400)
  })

  it('refuses to start another hop once the deadline has passed', async () => {
    const h = harness(() => ({
      status: 302,
      headers: { location: 'https://example.com/next' },
      delayMs: 40,
    }))

    await expect(
      fetchIcsGuarded('https://example.com/a.ics', {
        requestImpl: h.impl,
        resolver,
        timeoutMs: 50,
      }),
    ).rejects.toBeInstanceOf(SsrfError)

    // It must give up mid-chain rather than running the full MAX_REDIRECTS.
    expect(h.callCount()).toBeLessThan(MAX_REDIRECTS + 1)
  })

  it('RELEASES a redirect body instead of abandoning the stream', async () => {
    const h = harness((hop) =>
      hop === 1
        ? {
            status: 302,
            headers: { location: 'https://example.com/final.ics' },
            chunks: [enc.encode('x'.repeat(1000))],
          }
        : { body: 'BEGIN:VCALENDAR\nEND:VCALENDAR' },
    )

    const out = await fetchIcsGuarded('https://example.com/a.ics', {
      requestImpl: h.impl,
      resolver,
    })

    expect(out).toContain('BEGIN:VCALENDAR')
    expect(
      (h.responses[0] as unknown as { destroyed: boolean }).destroyed,
      'an unread redirect body holds its socket open',
    ).toBe(true)
  })

  it('measures the cap in BYTES, not UTF-16 code units', async () => {
    /*
     * A body of multi-byte characters is larger on the wire than
     * `String.length` suggests. Measuring the string understated it against a
     * cap expressed in bytes, so a feed could exceed the real limit.
     *
     * 100 × 'é' is 100 UTF-16 code units and 200 UTF-8 bytes; a 150-byte cap
     * must reject it. Counting `byteLength` on the chunk is what makes that
     * true regardless of how the body is framed.
     */
    const h = harness([{ chunks: [enc.encode('é'.repeat(100))] }])
    await expect(
      fetchIcsGuarded('https://example.com/a.ics', {
        requestImpl: h.impl,
        resolver,
        maxBytes: 150,
      }),
    ).rejects.toMatchObject({ code: 'response_too_large' })
  })

  it('reassembles a multi-byte character split across chunk boundaries', async () => {
    /*
     * The streaming decoder is not decoration. 'é' is 0xC3 0xA9; decoding each
     * chunk independently yields two replacement characters and silently
     * corrupts any non-ASCII calendar — event titles, names, locations.
     */
    const h = harness([{ chunks: [new Uint8Array([0xc3]), new Uint8Array([0xa9])] }])
    await expect(
      fetchIcsGuarded('https://example.com/a.ics', { requestImpl: h.impl, resolver }),
    ).resolves.toBe('é')
  })

  it('still returns a body that fits the budget', async () => {
    const h = harness([{ body: 'BEGIN:VCALENDAR\nEND:VCALENDAR' }])
    await expect(
      fetchIcsGuarded('https://example.com/a.ics', {
        requestImpl: h.impl,
        resolver,
        maxBytes: 1000,
      }),
    ).resolves.toContain('VCALENDAR')
  })

})
