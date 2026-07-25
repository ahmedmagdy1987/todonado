import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { json } from './http.js'
import { readRawBody, toNodeHandler } from './nodeAdapter.js'

/** Minimal IncomingMessage stand-in backed by a real Readable. */
function makeReq(opts: {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
}): IncomingMessage {
  const stream = Readable.from(opts.body ? [Buffer.from(opts.body)] : [])
  const req = stream as unknown as IncomingMessage
  Object.assign(req, {
    method: opts.method ?? 'GET',
    url: opts.url ?? '/api/x',
    headers: { host: 'www.todonado.com', ...(opts.headers ?? {}) },
  })
  return req
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
