import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpRequest, Agent as HttpAgent } from 'node:http'
import { request as httpsRequest, Agent as HttpsAgent } from 'node:https'
import { isIP } from 'node:net'
import type { LookupFunction } from 'node:net'

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
 *   4. DNS IS RESOLVED AND EVERY RESULTING ADDRESS VALIDATED BEFORE CONNECTING,
 *      so `internal.corp` or a hostname deliberately pointed at 127.0.0.1 /
 *      169.254.169.254 (cloud metadata) is rejected — a scheme/host string check
 *      alone would not catch that.
 *   5. THE VALIDATED ADDRESS IS THE ONE CONNECTED TO (see below). The socket is
 *      pinned to it, so there is no second resolution to poison.
 *   6. REDIRECTS ARE FOLLOWED MANUALLY and each hop is re-validated AND re-pinned.
 *      Without this, an allowed public host could simply 302 to the metadata
 *      endpoint, which defeats every check above.
 *   7. ONE timeout and ONE byte budget for the WHOLE request — set before the
 *      first hop and spent by every hop after it — so a redirect chain cannot
 *      multiply either (audit FLAG-15). Redirect bodies are released rather
 *      than abandoned.
 *
 * The pure parts are exported for unit testing; the network parts take injected
 * dependencies so the tests need no sockets.
 *
 * ── FLAG-6 / issue #10 — DNS REBINDING (TOCTOU) — FIXED HERE ────────────────
 *
 * THE BUG. `assertPublicHost` resolved the hostname and validated every
 * address, and then the code THREW THE ADDRESSES AWAY and handed the HOSTNAME
 * to `fetch`, which resolved it a SECOND time, independently. A caller who
 * controls their own DNS answered the first lookup with a public address and
 * the second with `127.0.0.1`, and the body came back to them. The address that
 * was checked was never the address that was connected to.
 *
 * THE FIX, AND WHY IT IS SHAPED LIKE THIS. The connection is pinned to the
 * address that was actually validated, via a custom `lookup` hook on a
 * hop-scoped Agent. The hook ignores the hostname it is handed and returns the
 * pre-validated literal address — so the resolution the socket layer performs
 * IS the resolution we checked, not a second one racing it. There is no window
 * between the check and the connect for DNS to change under us, because no
 * second DNS query happens at all.
 *
 * WHY NOT THE OBVIOUS ALTERNATIVES:
 *
 *   • SUBSTITUTING THE IP INTO THE URL (`https://93.184.216.34/f.ics` with a
 *     `Host:` header) breaks TLS. The certificate is issued for the hostname,
 *     so validation fails unless `servername` is threaded through by hand, and
 *     any mistake there silently disables the check that makes https worth
 *     anything. The lookup hook keeps the ORIGINAL hostname everywhere it is
 *     load-bearing — Host header, SNI, and certificate validation — and swaps
 *     only the address the socket dials.
 *
 *   • AN UNDICI `Agent`/`Dispatcher` passed to `fetch` DOES NOT WORK, and this
 *     was measured rather than assumed (2026-08-01): Node's BUILT-IN fetch uses
 *     Node's INTERNAL undici, not the npm package, so a dispatcher from the
 *     installed `undici` is rejected with UND_ERR_INVALID_ARG and the custom
 *     lookup is invoked ZERO times. Making it work meant adding undici as a
 *     PRODUCTION dependency and swapping the fetch implementation wholesale.
 *     `node:http` / `node:https` are in the runtime already, cost no dependency,
 *     and expose the lookup hook directly.
 *
 *   • MONKEY-PATCHING `dns.lookup` is rejected outright. It is process-global,
 *     so it would alter resolution for Supabase, Stripe and every other client
 *     in the same lambda, and it leaks across concurrent calendar fetches.
 *
 * WHAT IS DELIBERATELY NOT SHARED. The Agent is created per hop and destroyed
 * in that hop's `finally`, with `keepAlive: false`. A global or reused agent
 * would pool sockets ACROSS hosts and requests, and a pooled socket is a
 * connection that was pinned for a DIFFERENT hostname — which would reintroduce
 * exactly the confusion this fix removes. Per hop is also what lets each
 * redirect target be resolved, validated and pinned FRESH.
 *
 * The residual risk this closes, precisely: a Pro or founding user could cause
 * one GET from Vercel's egress to an address of their choosing and read up to
 * the byte cap back. That is now impossible through DNS: the only addresses
 * reachable are ones `isPrivateIp` has already passed.
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
 *
 * THAT MIGRATION IS NOW WRITTEN, AND IS NOT YET APPLIED:
 * `supabase/migrations/20260808120000_calendar_sources_write_guard.sql` — a
 * 10-row per-user cap enforced by a trigger under an advisory lock, plus
 * structural CHECKs on the URL. Until the owner runs it, everything in the
 * paragraph above is still the whole story.
 *
 * WHAT IT DOES NOT CHANGE, AND THIS FILE STAYS AUTHORITATIVE FOR: the DNS half.
 * The write-time check is deliberately structural — it never resolves a name,
 * because a lookup inside a CHECK would make the database itself emit outbound
 * requests, which is the very primitive being removed. A host like
 * `metadata.google.internal` is structurally ordinary and passes write time; it
 * is `resolveAllPublic` + `isPrivateIp` below that refuse it, by address.
 */

/** Hard ceiling on a fetched .ics body (subscribed feeds are legitimately large). */
export const MAX_ICS_BYTES = 8_000_000
/** Abort a stalled/tar-pit ICS host. */
export const FETCH_TIMEOUT_MS = 10_000
/** Redirect hops to follow; each one is fully re-validated AND re-pinned. */
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
 *
 * THE RETURN VALUE IS LOAD-BEARING, not informational. Discarding it is exactly
 * what made this module vulnerable to DNS rebinding (issue #10): the caller
 * MUST connect to one of these addresses rather than re-resolving the hostname.
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

/**
 * A `lookup` hook that answers with ONE pre-validated address and never touches
 * DNS. Handed to the hop's Agent, it is the entire fix for issue #10.
 *
 * Node's socket layer calls this in two shapes — `{ all: true }` wants an array
 * of `{ address, family }`, the default wants `(err, address, family)`. Both are
 * answered, because which one is used is an implementation detail of the
 * runtime and a wrong guess would fail open by falling back to real DNS.
 */
export function pinnedLookup(address: string): LookupFunction {
  const family = isIP(address)
  // The hostname is IGNORED on purpose — that is the fix. Answering it would be
  // a second resolution, which is exactly the window this closes.
  return ((_hostname, options, callback) => {
    const wantsAll =
      typeof options === 'object' && options !== null && (options as { all?: boolean }).all === true
    if (wantsAll) {
      ;(callback as unknown as (
        err: NodeJS.ErrnoException | null,
        addresses: { address: string; family: number }[],
      ) => void)(null, [{ address, family }])
      return
    }
    ;(callback as unknown as (
      err: NodeJS.ErrnoException | null,
      address: string,
      family: number,
    ) => void)(null, address, family)
  }) as LookupFunction
}

/** The request options this module builds. Structural, so fakes are cheap. */
export interface SsrfRequestOptions {
  protocol: 'http:' | 'https:'
  /** The ORIGINAL hostname — Host header, SNI and certificate validation. */
  hostname: string
  port: number
  path: string
  method: 'GET'
  headers: Record<string, string>
  /** Hop-scoped, keepAlive:false, carrying `lookup`. Never a global agent. */
  agent: HttpAgent | HttpsAgent
  /** The pinned resolver. Same function the agent carries — see fetchIcsGuarded. */
  lookup: LookupFunction
  /** TLS verification stays ON. Stated rather than left to the default. */
  rejectUnauthorized: boolean
  /** SNI — omitted when the host is a literal IP, which SNI forbids. */
  servername?: string
}

/** The minimum of `http.ClientRequest` this module drives. */
export interface SsrfClientRequest {
  on(event: 'error', listener: (err: Error) => void): unknown
  end(): unknown
  destroy(error?: Error): unknown
}

/** The minimum of `http.IncomingMessage` this module reads. */
export interface SsrfIncomingMessage extends AsyncIterable<Uint8Array> {
  statusCode?: number
  headers: Record<string, string | string[] | undefined>
  destroy(error?: Error): unknown
  resume(): unknown
}

/**
 * THE INJECTION SEAM, AT REQUEST LEVEL RATHER THAN FETCH LEVEL.
 *
 * The old seam was `fetchImpl?: typeof fetch`, and it could not express the
 * thing that now matters: a `fetch` stub is handed a URL and has no lookup hook
 * to exercise, so a test could not tell a pinned connection from an unpinned
 * one. Injecting at the `http.request` level means a test receives the very
 * options object the socket layer would — including `lookup` — and can invoke
 * it to observe WHICH ADDRESS would actually be dialled.
 */
export type RequestImpl = (
  options: SsrfRequestOptions,
  onResponse: (res: SsrfIncomingMessage) => void,
) => SsrfClientRequest

const defaultRequestImpl: RequestImpl = (options, onResponse) => {
  const send = options.protocol === 'http:' ? httpRequest : httpsRequest
  // The cast is the boundary between our narrow structural options and Node's
  // very wide RequestOptions; every field above is one Node accepts.
  return send(options as never, (res) => onResponse(res as unknown as SsrfIncomingMessage))
}

export interface GuardedFetchDeps {
  requestImpl?: RequestImpl
  resolver?: Resolver
  maxBytes?: number
  timeoutMs?: number
}

/**
 * Fetch a user-supplied .ics URL safely. Validates the URL and its resolved
 * addresses, PINS THE CONNECTION TO A VALIDATED ADDRESS, follows redirects
 * MANUALLY (re-validating and re-pinning every hop), refuses an https→http
 * downgrade, sends no credentials, times out, and streams with a hard byte cap.
 */
export async function fetchIcsGuarded(
  rawUrl: string,
  deps: GuardedFetchDeps = {},
): Promise<string> {
  const {
    requestImpl = defaultRequestImpl,
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

    /*
     * VALIDATE, THEN PIN. `assertPublicHost` proves every address this hostname
     * answers with is public; we then dial ONE OF THOSE ADDRESSES rather than
     * the hostname, so there is no second resolution for a rebinding attacker
     * to win.
     *
     * The FIRST address is taken deliberately: `dns.lookup(…, {all:true})`
     * returns getaddrinfo's order, which already applies the platform's
     * RFC 6724 preference — so this is the address the OS would have chosen
     * anyway, not an arbitrary pick that could strand an IPv6-only or
     * IPv4-only host.
     */
    const addresses = await assertPublicHost(parsed.url.hostname, resolver)
    const pinned = addresses[0]

    const msLeft = deadline - Date.now()
    if (msLeft <= 0) throw new SsrfError('fetch_failed', 'request deadline exceeded')

    const isHttps = parsed.url.protocol === 'https:'
    const lookup = pinnedLookup(pinned)

    /*
     * HOP-SCOPED AGENT. `keepAlive: false` and `maxSockets: 1` because a pooled
     * socket is a connection pinned for a DIFFERENT hostname — reusing one
     * would smuggle the previous hop's address into this one. Destroyed in the
     * `finally` below, always.
     */
    const AgentCtor = isHttps ? HttpsAgent : HttpAgent
    const agent = new AgentCtor({ keepAlive: false, maxSockets: 1, lookup })

    const options: SsrfRequestOptions = {
      protocol: parsed.url.protocol as 'http:' | 'https:',
      // The ORIGINAL hostname, never the pinned IP: this is what sets the Host
      // header, the SNI servername and the name the certificate is checked
      // against. Only the ADDRESS is substituted, and only inside `lookup`.
      hostname: parsed.url.hostname,
      port: Number(parsed.url.port || (isHttps ? 443 : 80)),
      path: `${parsed.url.pathname}${parsed.url.search}`,
      method: 'GET',
      headers: {
        accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8',
        /*
         * IDENTITY, NOT gzip. Node does not transparently decompress, so a
         * compressed body would be counted at its COMPRESSED size against the
         * byte cap — a 2 MB budget would admit a decompression bomb many times
         * larger. Asking for identity keeps the number on the wire and the
         * number in the cap the same number.
         */
        'accept-encoding': 'identity',
      },
      agent,
      // Also passed at request level so the seam sees it. It is the SAME
      // function object the agent carries, so the two cannot disagree.
      lookup,
      // Stated explicitly: a rebinding fix that quietly disabled certificate
      // validation would trade one hole for a worse one.
      rejectUnauthorized: true,
      ...(isHttps && isIP(parsed.url.hostname) === 0
        ? { servername: parsed.url.hostname }
        : {}),
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    let response: SsrfIncomingMessage | undefined

    try {
      response = await new Promise<SsrfIncomingMessage>((resolve, reject) => {
        let settled = false
        const finish = (fn: () => void) => {
          if (settled) return
          settled = true
          fn()
        }

        const req = requestImpl(options, (res) => {
          response = res
          finish(() => resolve(res))
        })
        req.on('error', (err) => finish(() => reject(err)))

        timer = setTimeout(() => {
          /*
           * SETTLE FIRST, THEN TEAR DOWN. `destroy()` synchronously emits
           * 'error', which would otherwise win the race and reject with the
           * transport error instead of the deadline one. Both collapse to
           * `fetch_failed`, but only one of them says why.
           */
          finish(() => reject(new SsrfError('fetch_failed', 'request deadline exceeded')))
          // Kill both halves: a response that has begun streaming holds the
          // socket just as firmly as a request that never got one.
          req.destroy(new Error('request deadline exceeded'))
          response?.destroy(new Error('request deadline exceeded'))
        }, msLeft)

        req.end()
      })

      const status = response.statusCode ?? 0

      if (status >= 300 && status < 400) {
        const rawLocation = response.headers.location
        const location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation
        if (!location) throw new SsrfError('fetch_failed')

        /*
         * RELEASE THE REDIRECT BODY (audit FLAG-15). A 3xx may still carry one,
         * and an unread message holds its socket until GC gets round to it.
         * `resume()` then `destroy()` drains whatever is buffered and frees the
         * socket immediately, so a redirect body cannot be used to push bytes
         * at us for free — the chain is bounded by MAX_REDIRECTS, but each hop
         * was previously unbounded in size and simply never counted.
         */
        response.resume()
        response.destroy()

        const next = new URL(location, parsed.url)

        /*
         * NO HTTPS → HTTP DOWNGRADE. A feed that starts encrypted must not be
         * talked out of it by its own redirect: plaintext is both readable and
         * REWRITABLE in flight, so an on-path attacker could otherwise pick the
         * final destination regardless of every check here. Reported as
         * `bad_scheme`, which already collapses to `invalid_source` for the
         * client, so this adds no new externally visible code.
         */
        if (parsed.url.protocol === 'https:' && next.protocol === 'http:') {
          throw new SsrfError('bad_scheme', 'refusing https to http downgrade')
        }

        current = next.toString()
        continue // re-parsed, re-validated AND re-pinned at the top of the loop
      }

      if (status < 200 || status >= 300) {
        throw new SsrfError('fetch_failed', `HTTP ${status}`)
      }

      const rawLength = response.headers['content-length']
      const declared = Number(Array.isArray(rawLength) ? rawLength[0] : rawLength)
      if (Number.isFinite(declared) && declared > bytesRemaining) {
        throw new SsrfError('response_too_large')
      }

      /*
       * BOUNDED READER. The running cap is the load-bearing guard, since a
       * chunked reply declares no length at all — `content-length` above is an
       * early exit for the honest case, never the real limit.
       *
       * The decoder is STREAMING (`{ stream: true }`) so a multi-byte character
       * split across two chunks is reassembled rather than becoming two
       * replacement characters, and the final `decode()` flushes any trailing
       * partial sequence.
       */
      const decoder = new TextDecoder()
      let text = ''
      for await (const chunk of response) {
        bytesRemaining -= chunk.byteLength
        if (bytesRemaining < 0) {
          response.destroy()
          throw new SsrfError('response_too_large')
        }
        text += decoder.decode(chunk, { stream: true })
      }
      return text + decoder.decode()
    } catch (err) {
      // Anything that is not already one of ours is a transport failure. The
      // caller collapses these to a small safe set; nothing from here names an
      // address or echoes an upstream message.
      throw err instanceof SsrfError ? err : new SsrfError('fetch_failed')
    } finally {
      /*
       * DETERMINISTIC CLEANUP, on every path — success, throw, redirect
       * `continue`, or deadline. A live timer keeps a warm serverless instance
       * awake; an undestroyed Agent keeps its socket.
       */
      clearTimeout(timer)
      agent.destroy()
    }
  }
  throw new SsrfError('too_many_redirects')
}
