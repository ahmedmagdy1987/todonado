import { describe, expect, it } from 'vitest'
import { isValidEmail, isValidUsername, newPasswordError, usernameError } from './identifier'

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

describe('newPasswordError', () => {
  it('accepts a matching pair of 6+ characters', () => {
    expect(newPasswordError('secret1', 'secret1')).toBeNull()
  })
  it('rejects empty, short, and mismatched passwords with a message', () => {
    expect(newPasswordError('', '')).toMatch(/Enter a new password/)
    expect(newPasswordError('12345', '12345')).toMatch(/6 characters/)
    expect(newPasswordError('secret1', 'secret2')).toMatch(/match/)
  })
})
