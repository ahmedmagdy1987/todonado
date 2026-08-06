import { describe, expect, it } from 'vitest'
// The .js extension is required: tsconfig.api.json uses NodeNext, so an
// extensionless relative import is a compile error (and a runtime crash).
import { isDefinitivelyMissing } from './stripeErrors.js'

/**
 * NOT KNOWING IS NOT THE SAME AS KNOWING IT IS GONE.
 *
 * The session-reuse path used to mark the checkout attempt terminal on ANY
 * error from `sessions.retrieve`. A timeout, a 429, a Stripe 5xx or a DNS blip
 * therefore RELEASED the one-open-attempt slot while the original Checkout
 * Session was still open and still payable — so the next request minted a
 * second payable session and the customer could be charged twice for a
 * subscription the product cannot see, cancel or honour.
 *
 * That is the defect 20260801150000_checkout_attempts.sql exists to prevent,
 * reintroduced through the error path rather than the happy path.
 *
 * The slot may now be released ONLY on a definitive answer. This pins the
 * classification, which is the whole safety property: holding a slot is
 * recoverable, double-charging is not, so every ambiguous case must be false.
 */

const stripeErr = (over: Record<string, unknown>) => ({
  name: 'StripeError',
  message: 'boom',
  ...over,
})

describe('only a definitive resource_missing releases the slot', () => {
  it('resource_missing IS definitive', () => {
    expect(isDefinitivelyMissing(stripeErr({ type: 'StripeInvalidRequestError', code: 'resource_missing' }))).toBe(true)
  })

  it('an invalid-request 404 is the same statement in an older shape', () => {
    expect(isDefinitivelyMissing(stripeErr({ type: 'StripeInvalidRequestError', statusCode: 404 }))).toBe(true)
  })

  it.each([
    ['connection failure', { type: 'StripeConnectionError' }],
    ['rate limit', { type: 'StripeRateLimitError', statusCode: 429 }],
    ['Stripe 5xx', { type: 'StripeAPIError', statusCode: 500 }],
    ['Stripe 503', { type: 'StripeAPIError', statusCode: 503 }],
    ['authentication/config', { type: 'StripeAuthenticationError', statusCode: 401 }],
    ['permission', { type: 'StripePermissionError', statusCode: 403 }],
    ['a different invalid-request error', { type: 'StripeInvalidRequestError', code: 'parameter_invalid_empty' }],
    ['an invalid-request 400', { type: 'StripeInvalidRequestError', statusCode: 400 }],
  ])('%s is NOT definitive — the slot is held', (_label, shape) => {
    expect(isDefinitivelyMissing(stripeErr(shape))).toBe(false)
  })

  it.each([
    ['a bare Error', new Error('socket hang up')],
    ['a string', 'ETIMEDOUT'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 502],
    ['an empty object', {}],
    ['an unrecognised shape', { weird: true }],
  ])('%s is NOT definitive — unknown must fail SAFE', (_label, value) => {
    expect(isDefinitivelyMissing(value)).toBe(false)
  })

  it('fails safe rather than trusting instanceof across a module boundary', () => {
    /*
     * A structurally-cloned or re-thrown Stripe error loses its prototype. If
     * the check were `instanceof`, that error would fall through to "not
     * missing" — which is the SAFE direction here, so the property to pin is
     * that a plain object carrying the real code still reads as definitive.
     */
    const cloned = JSON.parse(JSON.stringify({ type: 'StripeInvalidRequestError', code: 'resource_missing' }))
    expect(isDefinitivelyMissing(cloned)).toBe(true)
  })
})
