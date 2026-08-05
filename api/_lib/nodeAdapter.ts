import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Bridges our Web-style handlers onto the contract Vercel actually invokes.
 *
 * WHY THIS EXISTS: this project's Vercel Node runtime calls functions with the
 * legacy signature `(req: IncomingMessage, res: ServerResponse)` — verified in
 * production, which reported `contract: "node", argc: 2,
 * firstArgCtor: "IncomingMessage"`. A handler written as `(req: Request) =>
 * Response` therefore has its return value DISCARDED: nothing is ever written to
 * `res`, so the request hangs until the connection dies. That is a silent
 * failure with no error and no log — worse than a crash.
 *
 * Keeping the handlers Web-shaped (and adapting here) means the handler logic
 * stays runtime-agnostic and fully unit-testable with plain `Request` objects.
 */
export type WebHandler = (req: Request) => Promise<Response>

/** Headers that must not be copied onto an outbound `Request`. */
const SKIP_REQUEST_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade'])

/**
 * Read the request body as RAW BYTES.
 *
 * Byte-exactness matters: Stripe's webhook signature is computed over the exact
 * payload, so any re-serialisation (JSON.parse → JSON.stringify) would break
 * verification. We therefore prefer the untouched stream and only fall back to a
 * platform-parsed `req.body` if the stream was already consumed.
 */
export async function readRawBody(
  req: IncomingMessage & { body?: unknown },
): Promise<Buffer | undefined> {
  if (req.readable) {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
    }
    if (chunks.length > 0) return Buffer.concat(chunks)
    return undefined
  }

  // Stream already consumed by the platform — reconstruct as best we can.
  const parsed = req.body
  if (parsed == null) return undefined
  if (Buffer.isBuffer(parsed)) return parsed
  if (typeof parsed === 'string') return Buffer.from(parsed)
  // NOTE: re-serialised, so NOT byte-exact. Signature verification would fail
  // here — see the raw-body check in docs/BILLING_SETUP.md.
  return Buffer.from(JSON.stringify(parsed))
}

/**
 * Copy raw bytes into a body backed by a fresh, ordinary `ArrayBuffer`.
 *
 * WHY THIS EXISTS — and why it is a copy rather than a cast. Since TypeScript
 * 5.7 `Buffer` is generic over its backing store, so `Buffer.concat` /
 * `Buffer.from` yield `Buffer<ArrayBufferLike>` — the store may be a
 * `SharedArrayBuffer`, and a pooled `Buffer` is a VIEW into a shared 8 KB slab.
 * The DOM's `BodyInit` reaches `BufferSource = ArrayBufferView<ArrayBuffer> |
 * ArrayBuffer`, which demands an ordinary `ArrayBuffer`, so a `Buffer` is
 * rejected outright (TS2322). `new Uint8Array(n)` is typed
 * `Uint8Array<ArrayBuffer>`, which satisfies BOTH that and Node's own
 * `NodeJS.ArrayBufferView` — so this one line compiles under `tsconfig.api.json`
 * (lib ES2023, no DOM) AND under the platform's own DOM-lib compilation of the
 * very same file, which is where the build actually broke.
 *
 * BYTE-EXACTNESS IS THE ENTIRE POINT. `.set()` copies the bytes verbatim,
 * honouring the source's `byteOffset`/`byteLength`, so a pooled `Buffer` yields
 * its own bytes and not its neighbours'. Nothing is decoded, re-encoded, parsed,
 * trimmed or normalised: Stripe's webhook signature is an HMAC over exactly
 * these bytes, and any transformation here would fail verification.
 */
function toBodyBytes(raw: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(raw.byteLength)
  bytes.set(raw)
  return bytes
}

export function toNodeHandler(
  handler: WebHandler,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const method = (req.method ?? 'GET').toUpperCase()
      const host = req.headers.host ?? 'www.todonado.com'
      const proto =
        (Array.isArray(req.headers['x-forwarded-proto'])
          ? req.headers['x-forwarded-proto'][0]
          : req.headers['x-forwarded-proto']) ?? 'https'
      const url = new URL(req.url ?? '/', `${proto}://${host}`)

      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined || key.startsWith(':') || SKIP_REQUEST_HEADERS.has(key)) continue
        if (Array.isArray(value)) for (const v of value) headers.append(key, v)
        else headers.set(key, value)
      }

      const raw = method === 'GET' || method === 'HEAD' ? undefined : await readRawBody(req)
      // `undefined` stays `undefined`: GET/HEAD and empty bodies must stay bodyless.
      const body = raw === undefined ? undefined : toBodyBytes(raw)
      const response = await handler(new Request(url, { method, headers, body }))

      res.statusCode = response.status
      response.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch {
      // The handler is already wrapped in withErrorBoundary, so reaching here
      // means the ADAPTER failed. Still answer — never leave the request hanging.
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('content-type', 'application/json')
      }
      res.end('{"error":"internal_error"}')
    }
  }
}
