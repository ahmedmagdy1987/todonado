import { describe, expect, it } from 'vitest'
import { checkoutErrorMessage } from './checkout'

describe('checkoutErrorMessage', () => {
  it('maps every API error code to human copy — never the raw code', () => {
    const codes = [
      'billing_not_configured',
      'unauthorized',
      'missing_price_id',
      'invalid_price',
      'no_subscription',
      'stripe_error',
      'billing_lookup_failed',
      'internal_error',
      'method_not_allowed',
    ]
    for (const code of codes) {
      const msg = checkoutErrorMessage(code, 500)
      expect(msg).not.toContain(code)
      expect(msg).not.toContain('_')
      expect(msg.length).toBeGreaterThan(10)
    }
  })

  it('falls back to a safe message for an unknown code', () => {
    expect(checkoutErrorMessage('some_new_code', 418)).toBe(
      'Something went wrong (418). Please try again.',
    )
  })

  it('falls back when the body carried no error code at all', () => {
    expect(checkoutErrorMessage(undefined, 502)).toBe(
      'Something went wrong (502). Please try again.',
    )
  })

  it('tells the user to sign in again on unauthorized', () => {
    expect(checkoutErrorMessage('unauthorized', 401)).toMatch(/sign in again/i)
  })
})
