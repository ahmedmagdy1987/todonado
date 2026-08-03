import { lookup as dnsLookup } from 'node:dns/promises'

/**
 * SSRF hardening for the calendar proxy.
 *
 * The proxy fetches a URL the USER supplied, from INSIDE our infrastructure —
 * the textbook server-side request forgery setup. Everything here exists to make
 * that safe:
 *
 *   1. Scheme allow-list (http/https only, after webcal→https). No file:, no
 *      gopher:, no data:.
 *   2. Port allow-list (80/443). Stops the proxy being used to sweep internal
 *      services on odd ports.
 *   3. No embedded credentials (`https://user:pass@host`).
 *   4. DNS IS RESOLVED AND EVERY RESULTING ADDRESS VALIDATED BEFORE FETCHING, so
 *      `internal.corp` or a hostname deliberately pointed at 127.0.0.1 /
 *      169.254.169.254 (cloud metadata) is rejected — a scheme/host string check
 *      alone would not catch that.
 *   5. REDIRECTS ARE FOLLOWED MANUALLY and each hop is re-validated. Without
 *      this, an allowed public host could simply 302 to the metadata endpoint,
 *      which defeats every check above.
 *   6. ONE timeout and ONE byte budget for the WHOLE request — set before the
 *      first hop and spent by every hop after it — so a redirect chain cannot
 *      multiply either (audit FLAG-15). Redirect bodies are drained rather
 *      than abandoned.
 *
 * The pure parts are exported for unit testing; the network parts take injected
 * dependencies so the tests need no sockets.
 *
 * ── STILL OPEN, STATED RATHER THAN IMPLIED ──────────────────────────────────
 *
 * FLAG-6 — DNS REBINDING (TOCTOU). Step 4 resolves the hostname and validates
 * every address, then hands the HOSTNAME to `fetch`, which resolves it AGAIN,
 * independently. A caller who controls their own DNS can answer the first
 * lookup with a public address and the second with a private one, and the body
 * comes back to them.
 *
 * The audit's suggested fix is an undici `Agent` with a custom `lookup` pinned
 * to the checked IP. That was TRIED and measured (2026-08-01): passing such a
 * dispatcher to Node's BUILT-IN fetch does not work — the custom lookup is
 * never invoked (0 calls) and the request fails with UND_ERR_INVALID_ARG,
 * because the built-in fetch uses Node's internal undici, not the npm package.
 * The same Agent passed to undici's OWN `fetch` DOES invoke it (1 call). So the
 * real fix is not an extra option: it means adding undici as a production
 * dependency AND swapping the fetch implementation this module is built on,
 * which changes the `fetchImpl?: typeof fetch` contract that all 66 tests here
 * inject through. That was judged too large to land safely in the same pass as
 * the billing work; it is a contained, well-understood follow-up.
 *
 * RESIDUAL RISK, precisely: a Pro or founding user — an authenticated,
 * paying account, not an anonymous attacker — can cause one GET from Vercel's
 * egress to an address of their choosing and read up to the byte cap back.
 * On Vercel's managed runtime there is no corporate internal network behind
 * that boundary, which is why the audit rates it Medium rather than High. The
 * cloud metadata endpoint (169.254.169.254) is the asset that would matter, and
 * hitting it requires winning a DNS race against a request the attacker cannot
 * observe. Bounding it: the endpoint is Pro-gated, rate limited to 6 requests
 * per minute per user (FLAG-10), and now capped by ONE timeout and ONE byte
 * budget per request (FLAG-15) rather than per hop.
 *
 * FLAG-5 — AUTHENTICATED OPEN PROXY. The design note above is right that the
 * request BODY is ignored and wrong that this makes the URL ours: it comes from
 * the caller's own `calendar_sources` rows, which the caller writes. Validating
 * at write time would narrow it, but the DNS half of the check cannot live in a
 * CHECK constraint, so a write-time guard would be advisory and the fetch-time
 * guard would still be the real one. What has changed is the blast radius, not
 * the shape: Pro-gated, 6/min, one budget per request. The durable fix is a
 * per-user cap on `calendar_sources` rows plus write-time URL validation, and
 * it is a migration the owner should schedule deliberately.
 */

/** Hard ceiling on a fetched .ics body (subscribed feeds are legitimately large). */
export const MAX_ICS_BYTES = 8_000_000
/** Abort a stalled/tar-pit ICS host. */
export const FETCH_TIMEOUT_MS = 10_000
/** Redirect hops to follow; each one is fully re-validated. */
export const MAX_REDIRECTS = 3
/** Only the standard web ports — an .ics feed has no business anywhere else. */
export const ALLOWED_PORTS = new Set(['', '80', '443'])

export type SsrfCode =
  | 'invalid_url'
  | 'bad_scheme'
  | 'bad_port'
  | 'has_credentials'
  | 'private_host'
  | 'dns_failed'
  | 'too_many_redirects'
  | 'response_too_large'
  | 'fetch_failed'

export class SsrfError extends Error {
  constructor(readonly code: SsrfCode, message?: string) {
    super(message ?? code)
    this.name = 'SsrfError'
  }
}

/** `webcal://` is just an .ics over https by convention. Trim and normalise. */
export function normalizeCalendarUrl(raw: string): string {
  return raw.trim().replace(/^webcal:\/\//i, 'https://')
}

/**
 * Parse + statically validate a user-supplied calendar URL. Returns the parsed
 * URL or the reason it was rejected. Does NOT touch the network.
 */
export function parseCalendarUrl(raw: string): { url: URL } | { reject: SsrfCode } {
  let url: URL
  try {
    url = new URL(normalizeCalendarUrl(raw))
  } catch {
    return { reject: 'invalid_url' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { reject: 'bad_scheme' }
  if (url.username || url.password) return { reject: 'has_credentials' }
  if (!ALLOWED_PORTS.has(url.port)) return { reject: 'bad_port' }
  if (!url.hostname) return { reject: 'invalid_url' }
  return { url }
}

/** Expand an IPv6 address to its 8 numeric hextets, or null if unparseable. */
function ipv6Hextets(input: string): number[] | null {
  const addr = input.split('%')[0] // strip any zone id
  const [head, tail] = addr.split('::')
  const parse = (part: string) => (part ? part.split(':').filter(Boolean) : [])
  const left = parse(head ?? '')
  const right = addr.includes('::') ? parse(tail ?? '') : []
  const groups = addr.includes('::')
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left
  if (groups.length !== 8) return null
  const out: number[] = []
  for (const g of groups) {
    const n = Number.parseInt(g, 16)
    if (!Number.isInteger(n) || n < 0 || n > 0xffff) return null
    out.push(n)
  }
  return out
}

function isPrivateIpv4(ip: string): boolean | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const o: number[] = []
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    o.push(n)
  }
  const [a, b] = o
  if (a === 0) return true // "this network"
  if (a === 10) return true // private
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local INCLUDING cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 192 && b === 0 && o[2] === 0) return true // IETF protocol assignments
  if (a === 192 && b === 0 && o[2] === 2) return true // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a === 198 && b === 51 && o[2] === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && o[2] === 113) return true // TEST-NET-3
  if (a >= 224) return true // multicast + reserved + broadcast
  return false
}

/**
 * True for any address that must never be reachable through the proxy:
 * loopback, private, link-local (incl. 169.254.169.254 cloud metadata), CGNAT,
 * multicast, reserved, unspecified — for both IPv4 and IPv6, including
 * IPv4-mapped IPv6 forms. Unparseable input is treated as private (fail closed).
 */
export function isPrivateIp(ip: string): boolean {
  const value = ip.trim()
  if (!value) return true

  const v4 = isPrivateIpv4(value)
  if (v4 !== null) return v4

  const hextets = ipv6Hextets(value)
  if (hextets === null) return true // not a recognisable IP → fail closed

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible — judge the embedded v4.
  const allZeroTop = hextets.slice(0, 5).every((h) => h === 0)
  if (allZeroTop && (hextets[5] === 0xffff || hextets[5] === 0)) {
    const embedded = `${hextets[6] >> 8}.${hextets[6] & 0xff}.${hextets[7] >> 8}.${hextets[7] & 0xff}`
    const mapped = isPrivateIpv4(embedded)
    if (mapped !== null) return mapped
  }

  const [first] = hextets
  if (hextets.every((h) => h === 0)) return true // ::
  if (hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1) return true // ::1
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
  return false
}

export type Resolver = (hostname: string) => Promise<{ address: string }[]>

/** Default resolver — every A/AAAA record for the host. */
const defaultResolver: Resolver = async (hostname) => {
  const results = await dnsLookup(hostname, { all: true })
  return results.map((r) => ({ address: r.address }))
}

/**
 * Resolve a hostname and require EVERY returned address to be public. Throws
 * `private_host` if any is not — a host that resolves to a mix must be rejected
 * outright, since we cannot control which address the fetch will use.
 */
export async function assertPublicHost(
  hostname: string,
  resolver: Resolver = defaultResolver,
): Promise<string[]> {
  let addresses: { address: string }[]
  try {
    addresses = await resolver(hostname)
  } catch {
    throw new SsrfError('dns_failed')
  }
  if (addresses.length === 0) throw new SsrfError('dns_failed')
  for (const { address } of addresses) {
    if (isPrivateIp(address)) throw new SsrfError('private_host')
  }
  return addresses.map((a) => a.address)
}

export interface GuardedFetchDeps {
  fetchImpl?: typeof fetch
  resolver?: Resolver
  maxBytes?: number
  timeoutMs?: number
}

/**
 * Fetch a user-supplied .ics URL safely. Validates the URL and its resolved
 * addresses, follows redirects MANUALLY (re-validating every hop), sends no
 * credentials, times out, and streams with a hard byte cap.
 */
export async function fetchIcsGuarded(
  rawUrl: string,
  deps: GuardedFetchDeps = {},
): Promise<string> {
  const {
    fetchImpl = fetch,
    resolver = defaultResolver,
    maxBytes = MAX_ICS_BYTES,
    timeoutMs = FETCH_TIMEOUT_MS,
  } = deps

  /*
   * ONE BUDGET FOR THE WHOLE REQUEST, NOT ONE PER HOP (audit FLAG-15).
   *
   * The timeout used to be a fresh AbortController inside the loop, so a chain
   * of MAX_REDIRECTS hops could legitimately take (MAX_REDIRECTS + 1) x
   * timeoutMs — 40s per source with the defaults, multiplied again by the
   * number of sources the caller has, all of it billable function time a user
   * chooses by editing their own calendar rows. The byte cap had the same
   * shape: `bytes` was declared per hop, so nothing accumulated across a chain.
   *
   * Both are now deadlines set ONCE, before the first hop, and consumed by
   * every hop after it.
   */
  const deadline = Date.now() + timeoutMs
  let bytesRemaining = maxBytes

  let current = rawUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const parsed = parseCalendarUrl(current)
    if ('reject' in parsed) throw new SsrfError(parsed.reject)
    await assertPublicHost(parsed.url.hostname, resolver)

    const msLeft = deadline - Date.now()
    if (msLeft <= 0) throw new SsrfError('fetch_failed', 'request deadline exceeded')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), msLeft)
    let res: Response
    try {
      res = await fetchImpl(parsed.url, {
        method: 'GET',
        // Manual: an allowed host must not be able to bounce us somewhere internal.
        redirect: 'manual',
        signal: controller.signal,
        // No cookies, no ambient auth — this is an anonymous public fetch.
        credentials: 'omit',
        headers: { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8' },
      })
    } catch {
      clearTimeout(timer)
      throw new SsrfError('fetch_failed')
    }

    try {
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        if (!location) throw new SsrfError('fetch_failed')
        /*
         * DRAIN THE REDIRECT BODY (audit FLAG-15). A 3xx may still carry one,
         * and an unread stream holds its socket until GC gets round to it.
         * Cancelling releases it immediately and, more importantly, means a
         * redirect body cannot be used to push bytes at us for free — the
         * chain is bounded by MAX_REDIRECTS, but each hop was previously
         * unbounded in size and simply never counted.
         */
        await res.body?.cancel().catch(() => {})
        current = new URL(location, parsed.url).toString()
        continue // re-validated at the top of the loop
      }
      if (!res.ok) throw new SsrfError('fetch_failed', `HTTP ${res.status}`)

      const declared = Number(res.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > bytesRemaining) {
        throw new SsrfError('response_too_large')
      }
      if (!res.body) {
        const text = await res.text()
        // Byte length, not string length: `text.length` counts UTF-16 code
        // units, so a multi-byte feed measured that way understates its real
        // size against a cap expressed in bytes.
        if (Buffer.byteLength(text, 'utf8') > bytesRemaining) {
          throw new SsrfError('response_too_large')
        }
        return text
      }

      // Running cap — the load-bearing guard, since chunked replies declare no length.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let text = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytesRemaining -= value.byteLength
        if (bytesRemaining < 0) {
          await reader.cancel()
          throw new SsrfError('response_too_large')
        }
        text += decoder.decode(value, { stream: true })
      }
      return text + decoder.decode()
    } finally {
      clearTimeout(timer)
    }
  }
  throw new SsrfError('too_many_redirects')
}
