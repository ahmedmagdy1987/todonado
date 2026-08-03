import { describe, expect, it, vi } from 'vitest'
import { apiError, json, redactSecrets, withErrorBoundary } from './http.js'

describe('json', () => {
  it('serialises the body with a JSON content-type', async () => {
    const res = json(200, { url: 'https://checkout.stripe.com/x' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    await expect(res.json()).resolves.toEqual({ url: 'https://checkout.stripe.com/x' })
  })
})

describe('apiError', () => {
  it('returns a stable machine-readable code', async () => {
    const res = apiError(401, 'unauthorized')
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' })
  })

  it('carries the missing env var NAMES for a config failure', async () => {
    const res = apiError(503, 'billing_not_configured', { missing: ['STRIPE_SECRET_KEY'] })
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      error: 'billing_not_configured',
      missing: ['STRIPE_SECRET_KEY'],
    })
  })
})

describe('redactSecrets', () => {
  it.each([
    ['sk_live_ABCdef123456789', 'stripe secret key'],
    ['sk_test_ABCdef123456789', 'stripe test key'],
    ['rk_live_ABCdef123456789', 'stripe restricted key'],
    ['pk_test_ABCdef123456789', 'stripe publishable key'],
    ['whsec_ABCdef123456789', 'webhook signing secret'],
    ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-DEF_123', 'a JWT (service-role key shape)'],
  ])('redacts %s (%s)', (secret) => {
    const out = redactSecrets(`upstream said: ${secret} is invalid`)
    expect(out).not.toContain(secret)
    expect(out).toContain('[redacted')
  })

  it('leaves ordinary messages intact', () => {
    expect(redactSecrets('No such price: price_123')).toBe('No such price: price_123')
  })
})

describe('withErrorBoundary', () => {
  it('passes a normal response straight through', async () => {
    const wrapped = withErrorBoundary(async () => json(200, { ok: true }))
    const res = await wrapped(new Request('https://x.test/api', { method: 'POST' }))
    expect(res.status).toBe(200)
  })

  it('converts an unhandled throw into 500 internal_error (never a naked 500)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapped = withErrorBoundary(async () => {
      throw new Error('boom')
    })
    const res = await wrapped(new Request('https://x.test/api', { method: 'POST' }))
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toBe('application/json')
    await expect(res.json()).resolves.toEqual({ error: 'internal_error' })
    spy.mockRestore()
  })

  it('never leaks a secret from a thrown message into the response', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapped = withErrorBoundary(async () => {
      throw new Error('Invalid API Key provided: sk_live_ABCdef123456789')
    })
    const res = await wrapped(new Request('https://x.test/api', { method: 'POST' }))
    const body = await res.text()
    expect(body).not.toContain('sk_live_ABCdef123456789')
    expect(body).toBe('{"error":"internal_error"}')
    // and the server-side log is redacted too
    expect(spy.mock.calls.flat().join(' ')).not.toContain('sk_live_ABCdef123456789')
    spy.mockRestore()
  })
})

describe('redactSecrets — live-mode formats (go-live readiness)', () => {
  it('redacts a LIVE Stripe secret key, not just a test one', () => {
    expect(redactSecrets('boom sk_live_51AbCdEfGhIjKlMn')).toBe('boom [redacted-stripe-key]')
  })

  it('redacts a live restricted key', () => {
    expect(redactSecrets('rk_live_51AbCdEfGhIjKlMn')).toBe('[redacted-stripe-key]')
  })

  it("redacts Supabase's sb_secret_ format", () => {
    // The audit reasoned this gap stopped mattering once responses no longer
    // echoed upstream messages. That is true of responses and says nothing
    // about LOGS, which every error path here still writes.
    expect(redactSecrets('key=sb_secret_AbCdEf-123')).toBe('key=[redacted-supabase-key]')
  })

  it('redacts a live webhook signing secret', () => {
    expect(redactSecrets('whsec_AbCdEf123')).toBe('[redacted-webhook-secret]')
  })
})
