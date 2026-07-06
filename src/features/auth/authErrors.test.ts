import { describe, expect, it } from 'vitest'
import { isEmailRateLimitError, isNoAccountOtpError, isNoAccountResetError } from './authErrors'

/**
 * F2: magic-link (signInWithOtp + shouldCreateUser:false) must show the SAME
 * neutral message whether or not the email has an account. The "no account"
 * GoTrue error is detected here and swallowed into that neutral confirmation,
 * while real errors (rate limit, network) still surface.
 */
describe('isNoAccountOtpError', () => {
  it('matches the GoTrue "otp_disabled" code (unknown email, shouldCreateUser:false)', () => {
    expect(isNoAccountOtpError({ code: 'otp_disabled', message: 'Signups not allowed for otp' })).toBe(true)
  })

  it('matches by message when the code is absent', () => {
    expect(isNoAccountOtpError({ message: 'Signups not allowed for otp' })).toBe(true)
    expect(isNoAccountOtpError({ message: 'otp_disabled' })).toBe(true)
  })

  it('does NOT match genuine operational errors (these should surface)', () => {
    expect(isNoAccountOtpError({ code: 'over_email_send_rate_limit', message: 'rate limit exceeded' })).toBe(false)
    expect(isNoAccountOtpError({ message: 'Network request failed' })).toBe(false)
    expect(isNoAccountOtpError(null)).toBe(false)
    expect(isNoAccountOtpError(undefined)).toBe(false)
    expect(isNoAccountOtpError({})).toBe(false)
  })
})

/**
 * Password reset must show the SAME neutral message whether or not the email
 * has an account (non-enumerating), mirroring the magic-link treatment above.
 */
describe('isNoAccountResetError', () => {
  it('matches the GoTrue "user_not_found" code and message', () => {
    expect(isNoAccountResetError({ code: 'user_not_found', message: 'User not found' })).toBe(true)
    expect(isNoAccountResetError({ message: 'User not found' })).toBe(true)
  })

  it('does NOT match genuine operational errors (the no-account classifier stays narrow)', () => {
    // The rate-limit is handled by isEmailRateLimitError below, NOT here.
    expect(isNoAccountResetError({ code: 'over_email_send_rate_limit', message: 'rate limit exceeded' })).toBe(false)
    expect(isNoAccountResetError({ message: 'Network request failed' })).toBe(false)
    expect(isNoAccountResetError(null)).toBe(false)
    expect(isNoAccountResetError(undefined)).toBe(false)
    expect(isNoAccountResetError({})).toBe(false)
  })
})

/**
 * The PER-EMAIL send-frequency 429 can only fire for an email that HAS an account,
 * so it must be swallowed into the neutral confirmation (not surfaced) — else it is
 * an account-existence oracle. But it must stay narrow: the IP-based
 * over_request_rate_limit and all other errors must still surface.
 */
describe('isEmailRateLimitError', () => {
  it('matches the per-email send-frequency limit by code and message', () => {
    expect(isEmailRateLimitError({ code: 'over_email_send_rate_limit', message: 'x' })).toBe(true)
    expect(
      isEmailRateLimitError({ message: 'For security purposes, you can only request this after 55 seconds' }),
    ).toBe(true)
  })

  it('does NOT match the IP-based limit, network, or empty errors (these still surface)', () => {
    expect(isEmailRateLimitError({ code: 'over_request_rate_limit', message: 'too many requests' })).toBe(false)
    expect(isEmailRateLimitError({ message: 'Network request failed' })).toBe(false)
    expect(isEmailRateLimitError(null)).toBe(false)
    expect(isEmailRateLimitError(undefined)).toBe(false)
    expect(isEmailRateLimitError({})).toBe(false)
  })
})
