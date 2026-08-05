import { Readable } from 'node:stream'
import { createHmac } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { json } from './http.js'
import { readRawBody, toNodeHandler } from './nodeAdapter.js'

/** Minimal IncomingMessage stand-in backed by a real Readable. */
function makeReq(opts: {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string | Buffer
}): IncomingMessage {
  const raw = typeof opts.body === 'string' ? Buffer.from(opts.body) : opts.body
  const stream = Readable.from(raw && raw.length > 0 ? [raw] : [])
  const req = stream as unknown as IncomingMessage
  Object.assign(req, {
    method: opts.method ?? 'GET',
    url: opts.url ?? '/api/x',
    headers: { host: 'www.todonado.com', ...(opts.headers ?? {}) },
  })
  return req
}

/**
 * Run one request through the adapter and hand back the exact BYTES the Web
 * `Request` ended up carrying — `null` when it carries no body at all.
 *
 * Reading `await req.arrayBuffer()` is deliberate: `req.text()` would decode,
 * and a decoded comparison cannot tell a byte-exact body from one that was
 * quietly re-encoded. Stripe's signature is an HMAC over the bytes, so the
 * bytes are what these tests assert.
 */
async function bytesSeenBy(reqInit: Parameters<typeof makeReq>[0]): Promise<Uint8Array | null> {
  let seen: Uint8Array | null = null
  const handler = toNodeHandler(async (req) => {
    seen = req.body === null ? null : new Uint8Array(await req.arrayBuffer())
    return json(200, {})
  })
  const { res } = makeRes()
  await handler(makeReq(reqInit), res)
  return seen
}

/** Captures what the handler wrote. */
function makeRes() {
  const state = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    ended: false,
    headersSent: false,
  }
  const res = {
    get statusCode() {
      return state.statusCode
    },
    set statusCode(v: number) {
      state.statusCode = v
    },
    get headersSent() {
      return state.headersSent
    },
    setHeader(k: string, v: string) {
      state.headers[k.toLowerCase()] = v
    },
    end(chunk?: Buffer | string) {
      state.body = chunk ? chunk.toString() : ''
      state.ended = true
      state.headersSent = true
    },
  }
  return { res: res as unknown as ServerResponse, state }
}

describe('readRawBody', () => {
  it('returns the exact bytes from the stream (byte-exact for Stripe signatures)', async () => {
    const payload = '{"id":"evt_1","spaced":  true}'
    const body = await readRawBody(makeReq({ method: 'POST', body: payload }))
    expect(body?.toString()).toBe(payload)
  })

  it('is undefined when there is no body', async () => {
    expect(await readRawBody(makeReq({ method: 'POST' }))).toBeUndefined()
  })

  it('falls back to a platform-parsed body when the stream is spent', async () => {
    const req = makeReq({ method: 'POST' })
    // Simulate the platform having already consumed + parsed the stream.
    Object.defineProperty(req, 'readable', { value: false })
    ;(req as IncomingMessage & { body?: unknown }).body = { id: 'evt_1' }
    const body = await readRawBody(req)
    expect(body?.toString()).toBe('{"id":"evt_1"}')
  })

  it('passes a pre-read Buffer body through untouched', async () => {
    const req = makeReq({ method: 'POST' })
    Object.defineProperty(req, 'readable', { value: false })
    ;(req as IncomingMessage & { body?: unknown }).body = Buffer.from('raw-bytes')
    expect((await readRawBody(req))?.toString()).toBe('raw-bytes')
  })
})

describe('toNodeHandler', () => {
  it('WRITES the response to res — the bug was returning it and hanging', async () => {
    const handler = toNodeHandler(async () => json(200, { ok: true }))
    const { res, state } = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    expect(state.ended).toBe(true)
    expect(state.statusCode).toBe(200)
    expect(state.headers['content-type']).toBe('application/json')
    expect(JSON.parse(state.body)).toEqual({ ok: true })
  })

  it('exposes a 2-argument signature so Vercel treats it as a Node handler', () => {
    expect(toNodeHandler(async () => json(200, {})).length).toBe(2)
  })

  it('passes method, url and headers through to the Web Request', async () => {
    let seen: Request | null = null
    const handler = toNodeHandler(async (req) => {
      seen = req
      return json(200, {})
    })
    const { res } = makeRes()
    await handler(
      makeReq({
        method: 'POST',
        url: '/api/create-checkout-session?x=1',
        headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
        body: '{"priceId":"price_1QAbCdEfGhIj"}',
      }),
      res,
    )
    const req = seen as unknown as Request
    expect(req.method).toBe('POST')
    expect(new URL(req.url).pathname).toBe('/api/create-checkout-session')
    expect(new URL(req.url).searchParams.get('x')).toBe('1')
    expect(req.headers.get('authorization')).toBe('Bearer tok')
    await expect(req.json()).resolves.toEqual({ priceId: 'price_1QAbCdEfGhIj' })
  })

  it('never leaves the request hanging if the handler itself throws', async () => {
    const handler = toNodeHandler(async () => {
      throw new Error('adapter-level boom')
    })
    const { res, state } = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    expect(state.ended).toBe(true)
    expect(state.statusCode).toBe(500)
    expect(state.body).toBe('{"error":"internal_error"}')
  })

  it('does not attach a body to GET/HEAD', async () => {
    let hadBody: boolean | null = null
    const handler = toNodeHandler(async (req) => {
      hadBody = req.body !== null
      return json(200, {})
    })
    const { res } = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    expect(hadBody).toBe(false)
  })
})

/**
 * THE RAW BYTES ARE THE CONTRACT.
 *
 * `toBodyBytes` copies the request body into a fresh ordinary `ArrayBuffer` so
 * it satisfies `BodyInit` under the platform's DOM-lib compilation. A copy is
 * only correct if it is a PERFECT copy, so every assertion below compares
 * bytes, never parsed JSON and never decoded text: a re-serialised body parses
 * to the same object while hashing to a different digest, which is precisely
 * the failure that would silently break Stripe webhook verification.
 */
describe('raw request bytes survive the adapter untouched', () => {
  it('a JSON POST body reaches the Web Request byte for byte', async () => {
    // Irregular spacing and key order: JSON.parse -> JSON.stringify would
    // normalise both away, so this payload can tell a copy from a re-encode.
    const raw = Buffer.from('{"priceId":"price_1QAbCdEfGhIj",  "qty": 1,\n  "z":null}', 'utf8')
    const seen = await bytesSeenBy({ method: 'POST', body: raw })
    expect(seen).not.toBeNull()
    expect(Buffer.from(seen!)).toEqual(raw)
  })

  it('a Stripe-style raw webhook payload is byte for byte identical', async () => {
    const raw = Buffer.from(
      '{"id":"evt_1QAbCdEfGhIj","object":"event","type":"checkout.session.completed",' +
        '"data":{"object":{"id":"cs_test_a1","amount_total":900,"currency":"usd"}},' +
        '"livemode":false}',
      'utf8',
    )
    const seen = await bytesSeenBy({
      method: 'POST',
      url: '/api/stripe-webhook',
      headers: { 'stripe-signature': 't=1,v1=deadbeef', 'content-type': 'application/json' },
      body: raw,
    })
    expect(Buffer.from(seen!)).toEqual(raw)
    expect(seen!.byteLength).toBe(raw.byteLength)
  })

  it('preserves non-ASCII UTF-8 bytes exactly (2, 3 and 4 byte sequences)', async () => {
    // If anything decoded and re-encoded this with the wrong assumption, or
    // mangled the surrogate pair, the byte comparison below fails.
    const text = '{"note":"café £9 日本語 🚀"}'
    const raw = Buffer.from(text, 'utf8')
    // Guard the fixture itself: more bytes than UTF-16 code units proves the
    // payload really does carry multi-byte sequences worth protecting.
    expect(raw.byteLength).toBeGreaterThan(text.length)

    const seen = await bytesSeenBy({ method: 'POST', body: raw })
    expect(Buffer.from(seen!)).toEqual(raw)
    expect([...seen!]).toEqual([...raw])
  })

  it('delivers bytes a Stripe signature would still verify over', async () => {
    /*
     * This is the real contract, expressed the way Stripe expresses it:
     * `constructEvent` HMACs the payload it is handed. The webhook hands it
     * `await req.text()`, so the digest over what the handler received must
     * equal the digest over what the client actually sent.
     */
    const raw = Buffer.from('{"id":"evt_1","müller":"ß","emoji":"🚀","spaced":  true}', 'utf8')
    // An arbitrary local key. Deliberately NOT shaped like a real Stripe
    // signing secret: nothing here is, or resembles, a credential.
    const hmac = (payload: Buffer) =>
      createHmac('sha256', 'not-a-real-signing-key').update(payload).digest('hex')

    let delivered: string | null = null
    const handler = toNodeHandler(async (req) => {
      delivered = await req.text()
      return json(200, {})
    })
    const { res } = makeRes()
    await handler(makeReq({ method: 'POST', body: raw }), res)

    expect(hmac(Buffer.from(delivered!, 'utf8'))).toBe(hmac(raw))
  })

  it('an empty request stays bodyless rather than becoming a zero-length body', async () => {
    expect(await bytesSeenBy({ method: 'POST' })).toBeNull()
  })

  it('GET receives no body even when bytes are on the stream', async () => {
    expect(await bytesSeenBy({ method: 'GET', body: 'ignored' })).toBeNull()
  })

  it('HEAD receives no body even when bytes are on the stream', async () => {
    expect(await bytesSeenBy({ method: 'HEAD', body: 'ignored' })).toBeNull()
  })

  it('leaves method and headers untouched while carrying a raw body', async () => {
    let seen: Request | null = null
    const handler = toNodeHandler(async (req) => {
      seen = req
      return json(200, {})
    })
    const { res } = makeRes()
    await handler(
      makeReq({
        method: 'post',
        url: '/api/stripe-webhook',
        headers: {
          'stripe-signature': 't=1,v1=abc',
          'content-type': 'application/json',
          // Hop-by-hop: must still be dropped, exactly as before.
          connection: 'keep-alive',
        },
        body: Buffer.from('{"id":"evt_1"}', 'utf8'),
      }),
      res,
    )
    const req = seen as unknown as Request
    expect(req.method).toBe('POST')
    expect(req.headers.get('stripe-signature')).toBe('t=1,v1=abc')
    expect(req.headers.get('content-type')).toBe('application/json')
    expect(req.headers.get('host')).toBe('www.todonado.com')
    expect(req.headers.get('connection')).toBeNull()
    await expect(req.text()).resolves.toBe('{"id":"evt_1"}')
  })
})
