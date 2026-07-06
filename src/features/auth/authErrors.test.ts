import { describe, expect, it } from 'vitest'
import { isNoAccountOtpError, isNoAccountResetError } from './authErrors'

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

  it('does NOT match genuine operational errors (these should surface)', () => {
    expect(isNoAccountResetError({ code: 'over_email_send_rate_limit', message: 'rate limit exceeded' })).toBe(false)
    expect(isNoAccountResetError({ message: 'Network request failed' })).toBe(false)
    expect(isNoAccountResetError(null)).toBe(false)
    expect(isNoAccountResetError(undefined)).toBe(false)
    expect(isNoAccountResetError({})).toBe(false)
  })
})
