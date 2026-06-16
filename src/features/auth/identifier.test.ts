import { describe, expect, it } from 'vitest'
import { isValidEmail, isValidUsername, looksLikeEmail, usernameError } from './identifier'

describe('looksLikeEmail', () => {
  it('routes anything with "@" to the email path', () => {
    expect(looksLikeEmail('a@b.com')).toBe(true)
    expect(looksLikeEmail('alice')).toBe(false)
    expect(looksLikeEmail('alice_99')).toBe(false)
  })
})

describe('isValidEmail', () => {
  it('accepts well-formed emails and rejects junk', () => {
    expect(isValidEmail('you@example.com')).toBe(true)
    expect(isValidEmail('  you@example.com ')).toBe(true)
    expect(isValidEmail('nope')).toBe(false)
    expect(isValidEmail('a@b')).toBe(false)
  })
})

describe('isValidUsername / usernameError', () => {
  it('accepts 3-30 chars of letters, digits, underscore', () => {
    expect(isValidUsername('alice')).toBe(true)
    expect(isValidUsername('a_b_99')).toBe(true)
    expect(usernameError('alice')).toBeNull()
  })
  it('rejects too-short, too-long, and illegal characters with a message', () => {
    expect(isValidUsername('ab')).toBe(false)
    expect(usernameError('ab')).toMatch(/3 characters/)
    expect(usernameError('a'.repeat(31))).toMatch(/30 characters/)
    expect(usernameError('has space')).toMatch(/Letters/)
    expect(usernameError('bad-dash')).toMatch(/Letters/)
    expect(usernameError('')).toMatch(/Pick a username/)
  })
})
